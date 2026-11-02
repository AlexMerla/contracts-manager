import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstileToken, type FetchLike } from "@/lib/turnstile";

// No real network call and no real Cloudflare keys — the injected `fetchImpl`
// is the whole point of the module's signature (same spirit as the
// `vi.mock("@/lib/google/calendar")` stubs in contratos-actions.test.ts).
function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const originalSecret = process.env.TURNSTILE_SECRET_KEY;

beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.TURNSTILE_SECRET_KEY;
  } else {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }
  vi.restoreAllMocks();
});

describe("verifyTurnstileToken", () => {
  it("accepts a token Cloudflare reports as successful", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true })) as unknown as FetchLike;

    const result = await verifyTurnstileToken("good-token", { fetchImpl });

    expect(result.ok).toBe(true);
  });

  it("posts secret, response and remoteip form-encoded to Cloudflare", async () => {
    const calls: { url: string; body: string; method: string }[] = [];
    const fetchImpl = (async (url, init) => {
      calls.push({ url, body: init.body, method: init.method });
      return jsonResponse({ success: true });
    }) as FetchLike;

    await verifyTurnstileToken("tok", { remoteIp: "203.0.113.7", fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(calls[0].method).toBe("POST");
    const parsed = new URLSearchParams(calls[0].body);
    expect(parsed.get("secret")).toBe("test-secret");
    expect(parsed.get("response")).toBe("tok");
    expect(parsed.get("remoteip")).toBe("203.0.113.7");
  });

  it("rejects when Cloudflare answers success:false", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ success: false, "error-codes": ["invalid-input-response"] })) as FetchLike;

    const result = await verifyTurnstileToken("bad-token", { fetchImpl });

    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("No pudimos verificar"),
    });
  });

  it("fails closed when the secret key is not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true })) as unknown as FetchLike;

    const result = await verifyTurnstileToken("good-token", { fetchImpl });

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on an empty token without calling Cloudflare", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true })) as unknown as FetchLike;

    const result = await verifyTurnstileToken("   ", { fetchImpl });

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the request throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET");
    }) as FetchLike;

    const result = await verifyTurnstileToken("tok", { fetchImpl });

    expect(result.ok).toBe(false);
  });

  it("fails closed on a non-2xx status even if the body says success", async () => {
    const fetchImpl = (async () => jsonResponse({ success: true }, 500)) as FetchLike;

    const result = await verifyTurnstileToken("tok", { fetchImpl });

    expect(result.ok).toBe(false);
  });

  it("fails closed on an unparseable body", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    })) as FetchLike;

    const result = await verifyTurnstileToken("tok", { fetchImpl });

    expect(result.ok).toBe(false);
  });
});
