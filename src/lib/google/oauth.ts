// Flow B only (spec §4.3) — the Google Master connection. Deliberately not
// Auth.js: this OAuth exchange never touches `src/lib/auth.ts` or any user
// session token, only the `google_connection` singleton (via
// src/lib/google/connection.ts). A `super` session is required to *start*
// this flow (checked by the route handlers), but that's just "who may click
// connect" — it is not the credential being read or written.

// Scopes are the narrowest that cover sprint-06 tasks 6-7: `drive.file`
// (upload to app-created files/folders only, not full Drive access) and
// `calendar.events` (create/update events only, not full Calendar access).
// `userinfo.email` adds no write access at all — it only lets the settings
// page show WHICH Google account is connected (spec doesn't define this
// column, but knowing which mailbox is connected is a reasonable read-only
// admin convenience the user asked for, not a new business rule).
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

function getClientId(): string {
  const clientId = process.env.GOOGLE_MASTER_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_MASTER_CLIENT_ID no está configurada.");
  }
  return clientId;
}

function getClientSecret(): string {
  const clientSecret = process.env.GOOGLE_MASTER_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error("GOOGLE_MASTER_CLIENT_SECRET no está configurada.");
  }
  return clientSecret;
}

/** Derives the callback URL from the incoming request's own origin, so both
 * `http://localhost:3000` (dev) and the production domain work without an
 * extra env var — each origin actually used must be registered as an
 * "Authorized redirect URI" on the Google Cloud OAuth client. */
export function googleRedirectUri(requestUrl: string): string {
  return new URL("/api/google/callback", requestUrl).toString();
}

export function buildGoogleAuthorizationUrl(params: { redirectUri: string; state: string }): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  // offline + consent together are what guarantee Google returns a
  // refresh_token on every run, not just the first-ever authorization.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

/** Exchanges an authorization `code` for tokens. Throws a descriptive error
 * (surfaced to the `super` user on the settings page) if the exchange fails
 * or if Google didn't return a refresh_token — the latter typically means
 * `prompt=consent` was skipped or the app already has a live grant that
 * needs revoking first at https://myaccount.google.com/permissions. */
export async function exchangeGoogleCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<{ refreshToken: string; accessToken: string; expiresIn: number }> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Google rechazó el intercambio de código por tokens (HTTP ${response.status}): ${body || "sin detalle"}`
    );
  }

  const data = (await response.json()) as GoogleTokenResponse;

  if (!data.refresh_token) {
    throw new Error(
      "Google no devolvió un refresh_token. Si la cuenta Master ya había autorizado esta app antes, " +
        "revoque el acceso en https://myaccount.google.com/permissions e intente conectar de nuevo."
    );
  }

  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/** Thrown by {@link refreshGoogleAccessToken} when Google rejects the
 * refresh grant. Carries the raw `error` code so the caller can tell a
 * revoked/expired grant (`invalid_grant` — the connection is dead and a
 * `super` user must reconnect) apart from a transient 5xx (retriable as-is). */
export class GoogleRefreshError extends Error {
  readonly status: number;
  readonly googleError: string | null;

  constructor(message: string, status: number, googleError: string | null) {
    super(message);
    this.name = "GoogleRefreshError";
    this.status = status;
    this.googleError = googleError;
  }
}

/**
 * Exchanges the stored refresh token for a short-lived access token
 * (sprint-06 task 5). Lives here rather than in `api-client.ts` because the
 * client id/secret readers and the token endpoint are module-private to this
 * file — the alternative was exporting them just so another module could
 * re-assemble the same request.
 *
 * Note: Google does NOT rotate the refresh token on this grant, so there is
 * nothing to write back to `google_connection` on success.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let googleError: string | null = null;
    try {
      googleError = (JSON.parse(body) as { error?: string }).error ?? null;
    } catch {
      // Non-JSON error body — keep `googleError` null and fall back to the raw text.
    }
    throw new GoogleRefreshError(
      `Google rechazó la renovación del token (HTTP ${response.status}): ${googleError ?? body ?? "sin detalle"}`,
      response.status,
      googleError
    );
  }

  const data = (await response.json()) as GoogleTokenResponse;
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** Best-effort lookup of which Google mailbox is connected, purely for
 * display on the settings page — never used for authorization. Returns
 * `null` on any failure rather than throwing, since a working connection
 * must not be blocked by a userinfo hiccup. */
export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}
