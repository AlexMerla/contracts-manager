import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unlike the rest of this project's tests (real DB, no mocks), this suite
// mocks `@/lib/google/connection` and stubs global `fetch`: every path it
// covers is defined by what GOOGLE returns, and there is no way to make the
// real Google reply `invalid_grant` on demand without revoking the operator's
// live Master connection. The DB writes the client performs are asserted
// through the mock instead (`markGoogleConnectionError` was called), which is
// exactly the behaviour task 5's "done when" describes.
const { mockGetDecryptedRefreshToken, mockMarkGoogleConnectionError } = vi.hoisted(() => ({
  mockGetDecryptedRefreshToken: vi.fn(),
  mockMarkGoogleConnectionError: vi.fn(),
}));
vi.mock("@/lib/google/connection", () => ({
  getDecryptedRefreshToken: mockGetDecryptedRefreshToken,
  markGoogleConnectionError: mockMarkGoogleConnectionError,
}));

import { googleApiFetch, resetGoogleAccessTokenCache } from "@/lib/google/api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TOKEN_OK = { access_token: "ya29.fresh", expires_in: 3600, scope: "", token_type: "Bearer" };

describe("googleApiFetch", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    resetGoogleAccessTokenCache();
    mockGetDecryptedRefreshToken.mockReset().mockResolvedValue("1//0gStoredRefreshToken");
    mockMarkGoogleConnectionError.mockReset().mockResolvedValue(undefined);
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    process.env.GOOGLE_MASTER_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_MASTER_CLIENT_SECRET = "test-client-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes the access token and sends it as a bearer token", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(TOKEN_OK))
      .mockResolvedValueOnce(jsonResponse({ id: "file-1" }));

    const result = await googleApiFetch<{ id: string }>({
      url: "https://www.googleapis.com/drive/v3/files",
      operation: "probar",
    });

    expect(result).toEqual({ ok: true, data: { id: "file-1" } });
    const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.fresh");
  });

  it("reuses the cached access token across calls instead of refreshing again", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(TOKEN_OK))
      .mockResolvedValueOnce(jsonResponse({ id: "a" }))
      .mockResolvedValueOnce(jsonResponse({ id: "b" }));

    await googleApiFetch({ url: "https://example.test/a", operation: "probar" });
    await googleApiFetch({ url: "https://example.test/b", operation: "probar" });

    // 1 token call + 2 API calls — not 2 token calls.
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not reuse a cached token minted from a different refresh token", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(TOKEN_OK))
      .mockResolvedValueOnce(jsonResponse({ id: "a" }))
      .mockResolvedValueOnce(jsonResponse({ ...TOKEN_OK, access_token: "ya29.other" }))
      .mockResolvedValueOnce(jsonResponse({ id: "b" }));

    await googleApiFetch({ url: "https://example.test/a", operation: "probar" });
    mockGetDecryptedRefreshToken.mockResolvedValue("1//0gReconnectedToken");
    await googleApiFetch({ url: "https://example.test/b", operation: "probar" });

    expect(mockFetch).toHaveBeenCalledTimes(4);
    const [, init] = mockFetch.mock.calls[3] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.other");
  });

  it("reports not_connected without touching the network when no token is stored", async () => {
    mockGetDecryptedRefreshToken.mockResolvedValue(null);

    const result = await googleApiFetch({ url: "https://example.test/a", operation: "probar" });

    expect(result).toMatchObject({ ok: false, reason: "not_connected" });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockMarkGoogleConnectionError).not.toHaveBeenCalled();
  });

  it("flips the connection to disconnected when the refresh grant is revoked", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, 400));

    const result = await googleApiFetch({ url: "https://example.test/a", operation: "probar" });

    expect(result).toMatchObject({ ok: false, reason: "refresh_failed" });
    expect(mockMarkGoogleConnectionError).toHaveBeenCalledTimes(1);
    expect(mockMarkGoogleConnectionError.mock.calls[0][0]).toContain("revocado");
    // Task 5's "done when": the caller gets a graceful result, not a throw.
    expect(result.ok).toBe(false);
  });

  it("retries once with a fresh token when Google rejects a cached one with 401", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(TOKEN_OK))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "stale" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ ...TOKEN_OK, access_token: "ya29.second" }))
      .mockResolvedValueOnce(jsonResponse({ id: "ok" }));

    const result = await googleApiFetch<{ id: string }>({
      url: "https://example.test/a",
      operation: "probar",
    });

    expect(result).toEqual({ ok: true, data: { id: "ok" } });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("surfaces an API error with its status and Google's message", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(TOKEN_OK))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 404, message: "File not found" } }, 404));

    const result = await googleApiFetch({
      url: "https://example.test/a",
      operation: "subir el contrato a Drive",
    });

    expect(result).toMatchObject({ ok: false, reason: "request_failed", status: 404 });
    if (result.ok) throw new Error("expected failure");
    expect(result.message).toContain("subir el contrato a Drive");
    expect(result.message).toContain("File not found");
  });

  it("turns a network-level throw into a result instead of propagating it", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(TOKEN_OK))
      .mockRejectedValueOnce(new Error("ECONNRESET"));

    const result = await googleApiFetch({ url: "https://example.test/a", operation: "probar" });

    expect(result).toMatchObject({ ok: false, reason: "request_failed", status: null });
  });
});
