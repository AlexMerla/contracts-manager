import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real database, no mocks (this project's established pattern — see
// src/app/(app)/listas-precios/actions.test.ts). `google_connection` is a
// singleton (spec §6.13), so unlike other fixtures in this codebase this
// test cannot just create-and-delete a throwaway row of its own: it has to
// operate on the one real row the whole app shares. To avoid destroying a
// connection made through a real manual OAuth run (sprint-06 task 3), the
// row's original state is captured in `beforeAll` and restored byte-for-byte
// in `afterAll` — if no row exists yet, it's deleted again at the end
// instead of left behind.
import { prisma } from "@/lib/prisma";
import {
  GOOGLE_CONNECTION_SINGLETON_ID,
  getDecryptedRefreshToken,
  getGoogleConnection,
  saveGoogleConnection,
} from "@/lib/google/connection";

const throwawaySuperId = randomUUID();

type ConnectionRow = Awaited<ReturnType<typeof prisma.googleConnection.findUnique>>;
let originalRow: ConnectionRow = null;

describe("google/connection (singleton row)", () => {
  beforeAll(async () => {
    originalRow = await prisma.googleConnection.findUnique({
      where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
    });

    await prisma.user.create({
      data: {
        id: throwawaySuperId,
        name: "Throwaway Super (google connection test)",
        email: "super-google-connection-test@example.com",
        passwordHash: "unused-in-this-test",
        role: "super",
      },
    });
  });

  afterAll(async () => {
    if (originalRow) {
      await prisma.googleConnection.update({
        where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
        data: {
          connected: originalRow.connected,
          refreshTokenEncrypted: originalRow.refreshTokenEncrypted,
          connectedEmail: originalRow.connectedEmail,
          connectedById: null, // clear FK first so the throwaway user can be deleted
          connectedAt: originalRow.connectedAt,
          lastError: originalRow.lastError,
        },
      });
      // Restore the real connectedById in a second write, now that the
      // throwaway user (below) is about to be gone — only meaningful if the
      // original row actually pointed at a still-existing user.
      if (originalRow.connectedById) {
        await prisma.googleConnection.update({
          where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
          data: { connectedById: originalRow.connectedById },
        });
      }
    } else {
      await prisma.googleConnection.deleteMany({
        where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
      });
    }

    await prisma.user.delete({ where: { id: throwawaySuperId } });
  });

  it("saves an encrypted token and reads it back decrypted to the original value", async () => {
    await saveGoogleConnection({
      refreshToken: "1//0gFirstRefreshTokenValue",
      connectedEmail: "throwaway-first@example.com",
      connectedById: throwawaySuperId,
    });

    const row = await prisma.googleConnection.findUniqueOrThrow({
      where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
    });
    // Stored value must not be the plaintext token.
    expect(row.refreshTokenEncrypted).not.toBe("1//0gFirstRefreshTokenValue");
    expect(row.refreshTokenEncrypted).toContain(":"); // iv:authTag:ciphertext

    const decrypted = await getDecryptedRefreshToken();
    expect(decrypted).toBe("1//0gFirstRefreshTokenValue");

    const status = await getGoogleConnection();
    expect(status.connected).toBe(true);
    expect(status.connectedById).toBe(throwawaySuperId);
    expect(status.connectedEmail).toBe("throwaway-first@example.com");
    expect(status.lastError).toBeNull();
    expect(status.connectedAt).not.toBeNull();
  });

  it("a second connect attempt updates the existing row instead of creating a duplicate", async () => {
    await saveGoogleConnection({
      refreshToken: "1//0gSecondRefreshTokenValue",
      connectedEmail: "throwaway-second@example.com",
      connectedById: throwawaySuperId,
    });

    const rows = await prisma.googleConnection.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(GOOGLE_CONNECTION_SINGLETON_ID);
    expect(rows[0].connectedEmail).toBe("throwaway-second@example.com");

    const decrypted = await getDecryptedRefreshToken();
    expect(decrypted).toBe("1//0gSecondRefreshTokenValue");
  });

  it("getGoogleConnection reports disconnected when no row exists", async () => {
    // Only meaningful when this suite legitimately starts from "no row" —
    // skip the negative assertion if a prior real connection was captured.
    if (originalRow) return;

    await prisma.googleConnection.deleteMany({
      where: { id: GOOGLE_CONNECTION_SINGLETON_ID },
    });

    const status = await getGoogleConnection();
    expect(status).toEqual({
      connected: false,
      lastError: null,
      connectedAt: null,
      connectedById: null,
      connectedEmail: null,
    });
  });
});
