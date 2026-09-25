import { describe, expect, it } from "vitest";

// Pure unit tests, no database — cover the key-derivation decision and the
// authenticated-encryption round trip in isolation from the singleton-row
// logic exercised in connection.test.ts.
import { decryptToken, encryptToken, getEncryptionKey } from "@/lib/google/encryption";

function withKey<T>(value: string | undefined, fn: () => T): T {
  const original = process.env.TOKEN_ENCRYPTION_KEY;
  // `process.env.X = undefined` coerces to the string "undefined" (env vars
  // are always strings) rather than actually unsetting it — `delete` is the
  // only way to truly simulate "not configured".
  if (value === undefined) {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.TOKEN_ENCRYPTION_KEY = value;
  }
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = original;
    }
  }
}

describe("google/encryption", () => {
  it("derives a 32-byte key from any non-empty configured string", () => {
    // Deliberately short/low-entropy, matching what's actually configured
    // in this project's .env — the point of the derivation is that this is
    // still accepted rather than rejected as "wrong length".
    withKey("a-short-passphrase", () => {
      expect(getEncryptionKey()).toHaveLength(32);
    });
  });

  it("derives the same key deterministically for the same input", () => {
    withKey("same-secret-every-time", () => {
      expect(getEncryptionKey().equals(getEncryptionKey())).toBe(true);
    });
  });

  it("derives different keys for different inputs", () => {
    const keyA = withKey("secret-a", () => getEncryptionKey());
    const keyB = withKey("secret-b", () => getEncryptionKey());
    expect(keyA.equals(keyB)).toBe(false);
  });

  it("throws a descriptive error when the key is missing", () => {
    withKey(undefined, () => {
      expect(() => getEncryptionKey()).toThrow(/no está configurada/);
    });
  });

  it("throws a descriptive error when the key is an empty string", () => {
    withKey("   ", () => {
      expect(() => getEncryptionKey()).toThrow(/no está configurada/);
    });
  });

  it("round-trips a token through encrypt then decrypt", () => {
    withKey("round-trip-test-secret", () => {
      const plaintext = "1//0gExampleRefreshTokenValue";
      const encrypted = encryptToken(plaintext);
      expect(encrypted).not.toContain(plaintext);
      expect(decryptToken(encrypted)).toBe(plaintext);
    });
  });

  it("fails to decrypt with a different key (auth tag mismatch)", () => {
    const encrypted = withKey("key-one", () => encryptToken("secret-value"));
    withKey("key-two", () => {
      expect(() => decryptToken(encrypted)).toThrow();
    });
  });
});
