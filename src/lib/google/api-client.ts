import { getDecryptedRefreshToken, markGoogleConnectionError } from "@/lib/google/connection";
import { GoogleRefreshError, refreshGoogleAccessToken } from "@/lib/google/oauth";

// Sprint-07: the step-result type moved to `@/lib/contracts/delivery-step` so
// the non-Google steps (Resend email, ManyChat) can share it without
// importing a Google module. Re-exported here so every existing import site
// (`actions.ts`, `drive.ts`, `calendar.ts`) keeps compiling unchanged.
export type { ContractDeliveryStepResult } from "@/lib/contracts/delivery-step";

// Sprint-06 task 5 — the auto-refreshing Google API client.
//
// Design contract: this module NEVER throws for an API/auth problem. Spec
// §4.2 requires the calling route (contract creation) to keep working and
// merely report which delivery step failed, so every failure mode comes back
// as a typed result instead of an exception. The only things that can still
// throw out of here are genuine programming errors.
//
// Transport is plain `fetch` against Google's REST endpoints — the same
// choice already made in `oauth.ts`. The `googleapis` npm package is
// deliberately NOT added: it is a very large dependency (it bundles
// discovery documents for every Google API) for the three endpoints this
// project actually calls, and it would pull a second, independent OAuth
// implementation alongside the one in `oauth.ts`.

export type GoogleApiFailure =
  /** No `google_connection` row, or no stored refresh token — never connected. */
  | { ok: false; reason: "not_connected"; message: string }
  /** The refresh grant itself was rejected; `google_connection` has been flipped to disconnected. */
  | { ok: false; reason: "refresh_failed"; message: string }
  /** Authentication worked; the Drive/Calendar call itself failed. */
  | { ok: false; reason: "request_failed"; message: string; status: number | null };

export type GoogleApiResult<T> = { ok: true; data: T } | GoogleApiFailure;

interface CachedAccessToken {
  /** The refresh token this access token was minted from. Caching *by* the
   * refresh token is what makes reconnecting to a different Google account
   * invalidate the cache for free — no cross-module cache-busting needed. */
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

// Access tokens live ~1h. `createContract` makes 2-4 Google calls in a single
// request (folder lookup + upload + event), so without a cache each one would
// pay a full round-trip to Google's token endpoint. The cache is per Node
// instance (serverless-safe: a cold start simply refreshes again) and is
// keyed by the refresh token, so it can never serve a token belonging to a
// connection that has since been replaced.
let cachedAccessToken: CachedAccessToken | null = null;

/** Refresh this long before actual expiry, so a token can't expire mid-flight. */
const EXPIRY_SKEW_MS = 60_000;

/** Test seam — drops the in-memory access token cache. */
export function resetGoogleAccessTokenCache(): void {
  cachedAccessToken = null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeRefreshFailure(error: unknown): string {
  if (error instanceof GoogleRefreshError && error.googleError === "invalid_grant") {
    return (
      "El acceso a Google fue revocado o expiró. Un usuario super debe volver a conectar " +
      "la cuenta Master desde Configuración."
    );
  }
  return `No se pudo renovar el acceso a Google: ${errorMessage(error)}`;
}

/** Google's JSON error envelope: `{ "error": { "code": 404, "message": "..." } }`. */
function extractGoogleErrorMessage(body: string): string {
  if (!body) {
    return "sin detalle";
  }
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
    return parsed.error?.message ?? body;
  } catch {
    return body;
  }
}

async function getAccessToken(): Promise<{ ok: true; accessToken: string } | GoogleApiFailure> {
  let refreshToken: string | null;
  try {
    refreshToken = await getDecryptedRefreshToken();
  } catch (error: unknown) {
    // A corrupt ciphertext or a changed TOKEN_ENCRYPTION_KEY lands here.
    return { ok: false, reason: "refresh_failed", message: describeRefreshFailure(error) };
  }

  if (!refreshToken) {
    return {
      ok: false,
      reason: "not_connected",
      message:
        "La cuenta de Google Master no está conectada. Un usuario super debe conectarla desde Configuración.",
    };
  }

  const now = Date.now();
  if (
    cachedAccessToken &&
    cachedAccessToken.refreshToken === refreshToken &&
    cachedAccessToken.expiresAt - EXPIRY_SKEW_MS > now
  ) {
    return { ok: true, accessToken: cachedAccessToken.accessToken };
  }

  try {
    const { accessToken, expiresIn } = await refreshGoogleAccessToken(refreshToken);
    cachedAccessToken = { refreshToken, accessToken, expiresAt: now + expiresIn * 1000 };
    return { ok: true, accessToken };
  } catch (error: unknown) {
    cachedAccessToken = null;
    const message = describeRefreshFailure(error);
    // Task 5's core requirement: a dead refresh token flips the singleton to
    // `connected = false` with a useful `lastError`, which is what raises the
    // reconnect banner (task 4). A failure to *write* that must not turn into
    // an unhandled throw either.
    try {
      await markGoogleConnectionError(message);
    } catch (dbError: unknown) {
      console.error("Failed to record google_connection.lastError:", dbError);
    }
    return { ok: false, reason: "refresh_failed", message };
  }
}

export interface GoogleApiRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Must be a replayable body (string or byte buffer) — the 401 path sends it
   * a second time, which a one-shot stream could not survive. The explicit
   * `<ArrayBuffer>` argument is what TS 5.7+'s `BufferSource` requires (a
   * bare `Uint8Array` widens to `ArrayBufferLike`, which `fetch` rejects). */
  body?: string | Uint8Array<ArrayBuffer>;
  /** Spanish infinitive phrase used to build the user-facing error message,
   * e.g. "subir el contrato a Drive" → "No se pudo subir el contrato a Drive". */
  operation: string;
}

/**
 * Performs an authenticated Google REST call, transparently refreshing the
 * access token first (and once more if Google rejects a cached one).
 *
 * `T` is the shape of the parsed JSON response; `204 No Content` resolves to
 * `undefined` cast to `T`, which is correct for the delete-style endpoints
 * that return no body.
 */
export async function googleApiFetch<T>(request: GoogleApiRequest): Promise<GoogleApiResult<T>> {
  async function perform(accessToken: string): Promise<Response | GoogleApiFailure> {
    try {
      return await fetch(request.url, {
        method: request.method ?? "GET",
        headers: { ...request.headers, Authorization: `Bearer ${accessToken}` },
        body: request.body,
      });
    } catch (error: unknown) {
      return {
        ok: false,
        reason: "request_failed",
        status: null,
        message: `No se pudo ${request.operation}: ${errorMessage(error)}`,
      };
    }
  }

  const token = await getAccessToken();
  if (!token.ok) {
    return token;
  }

  let response = await perform(token.accessToken);
  if (!(response instanceof Response)) {
    return response;
  }

  // A cached token Google no longer honours (revoked mid-flight, or a token
  // minted just before a reconnect). Drop it and retry exactly once — never a
  // loop, so a permanently-401ing endpoint can't spin.
  if (response.status === 401) {
    cachedAccessToken = null;
    const retryToken = await getAccessToken();
    if (!retryToken.ok) {
      return retryToken;
    }
    response = await perform(retryToken.accessToken);
    if (!(response instanceof Response)) {
      return response;
    }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      reason: "request_failed",
      status: response.status,
      message: `No se pudo ${request.operation} (HTTP ${response.status}): ${extractGoogleErrorMessage(body)}`,
    };
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch (error: unknown) {
    return {
      ok: false,
      reason: "request_failed",
      status: response.status,
      message: `Google respondió algo que no se pudo interpretar al ${request.operation}: ${errorMessage(error)}`,
    };
  }
}
