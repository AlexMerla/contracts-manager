import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/google/encryption";

// spec §6.13: `google_connection` is a singleton — "application logic must
// enforce exactly one row." No migration/seed pre-creates it (confirmed: no
// seed references this table), so this module owns creating the first row
// and pins it to a fixed, well-known id. Every read/write below targets that
// id specifically (never `findFirst`/`create`), so the primary key itself —
// not application-level check-then-act logic — is what makes a second row
// impossible: a second "connect" is a Prisma `upsert` against the same PK,
// which Postgres executes as an atomic `INSERT ... ON CONFLICT DO UPDATE`.
export const GOOGLE_CONNECTION_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

export interface GoogleConnectionStatus {
  connected: boolean;
  lastError: string | null;
  connectedAt: Date | null;
  connectedById: string | null;
  /** Which Google mailbox is connected — display-only (spec §6.13 doesn't
   * define this column; added on top for the settings page, never used for
   * authorization). `null` if never connected, or if the userinfo lookup
   * failed at connect time. */
  connectedEmail: string | null;
}

function toStatus(
  row: {
    connected: boolean;
    lastError: string | null;
    connectedAt: Date | null;
    connectedById: string | null;
    connectedEmail: string | null;
  } | null
): GoogleConnectionStatus {
  if (!row) {
    return {
      connected: false,
      lastError: null,
      connectedAt: null,
      connectedById: null,
      connectedEmail: null,
    };
  }
  return {
    connected: row.connected,
    lastError: row.lastError,
    connectedAt: row.connectedAt,
    connectedById: row.connectedById,
    connectedEmail: row.connectedEmail,
  };
}

/** Reads the (sole) connection row's status. Never returns the encrypted
 * token — callers that need it call {@link getDecryptedRefreshToken}. */
export async function getGoogleConnection(): Promise<GoogleConnectionStatus> {
  const row = await prisma.googleConnection.findUnique({
    where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
  });
  return toStatus(row);
}

/** Decrypts and returns the stored refresh token, or `null` if never
 * connected. For use by the auto-refreshing API client wrapper (sprint-06
 * task 5) — never exposed outside the server (spec §6.13: "never log or
 * return via API"). */
export async function getDecryptedRefreshToken(): Promise<string | null> {
  const row = await prisma.googleConnection.findUnique({
    where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
  });
  if (!row?.refreshTokenEncrypted) {
    return null;
  }
  return decryptToken(row.refreshTokenEncrypted);
}

/**
 * Persists a newly-obtained refresh token (task 3's OAuth callback calls
 * this). Encrypts before writing, sets `connected = true`, records who
 * connected it and when, and clears any previous `lastError`. Upserting the
 * fixed singleton id both creates the first-ever row and updates it on every
 * subsequent (re)connect — there is never a second row.
 */
export async function saveGoogleConnection(input: {
  refreshToken: string;
  connectedById: string;
  /** Best-effort — `null` when the userinfo lookup failed or was skipped;
   * never blocks saving the connection itself. */
  connectedEmail: string | null;
}): Promise<void> {
  const refreshTokenEncrypted = encryptToken(input.refreshToken);
  const connectedAt = new Date();

  await prisma.googleConnection.upsert({
    where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
    create: {
      id: GOOGLE_CONNECTION_SINGLETON_ID,
      connected: true,
      refreshTokenEncrypted,
      connectedEmail: input.connectedEmail,
      connectedById: input.connectedById,
      connectedAt,
      lastError: null,
    },
    update: {
      connected: true,
      refreshTokenEncrypted,
      connectedEmail: input.connectedEmail,
      connectedById: input.connectedById,
      connectedAt,
      lastError: null,
    },
  });
}

/**
 * Flips the connection to disconnected with a descriptive error (sprint-06
 * task 5's job: called when a refresh attempt fails because the token was
 * revoked/expired). Included here since it's the natural write-side
 * counterpart of this module and shares the same singleton-row concern —
 * not wired to any route yet.
 */
export async function markGoogleConnectionError(message: string): Promise<void> {
  await prisma.googleConnection.upsert({
    where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
    create: {
      id: GOOGLE_CONNECTION_SINGLETON_ID,
      connected: false,
      lastError: message,
    },
    update: {
      connected: false,
      lastError: message,
    },
  });
}
