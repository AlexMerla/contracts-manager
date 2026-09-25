import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// spec §11 / §6.13: `google_connection.refresh_token_encrypted` must be
// encrypted at rest. AES-256-GCM (authenticated encryption) — chosen over a
// plain cipher because GCM's auth tag also detects tampering/corruption on
// decrypt, not just leaks.
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // NIST-recommended IV length for GCM

// Key format decision: the `TOKEN_ENCRYPTION_KEY` actually configured in
// this project's env is a short human-chosen string, not a properly
// generated 32-byte hex/base64 key (confirmed by inspecting its length —
// 14 chars — while wiring this up; it is neither valid hex nor a 32-byte
// base64 payload). Rather than require the operator to regenerate it before
// this feature can work, the key actually used for AES-256-GCM is *derived*
// from whatever string is configured, via `scrypt` with a fixed,
// purpose-specific salt. This is deterministic (same env var -> same
// derived key every time, so previously-encrypted tokens keep decrypting
// across restarts/deploys) and scrypt's cost factor makes brute-forcing a
// low-entropy passphrase meaningfully harder than a bare hash would. The
// only requirement on the raw env var is that it's non-empty.
const KEY_DERIVATION_SALT = "contract-manager:google_connection:v1";

// scrypt is deliberately slow (that's the point) — cache the derived key
// per process so encrypt/decrypt don't pay that cost on every single call.
// Re-derives only if the raw env var value itself changes (relevant in
// tests, which swap it to exercise different scenarios).
let cachedKey: Buffer | null = null;
let cachedRaw: string | null = null;

/**
 * Resolves `TOKEN_ENCRYPTION_KEY` and derives the AES-256 key from it.
 * Throws immediately (called eagerly by both encrypt/decrypt) if the env
 * var is missing, instead of letting a misconfiguration fail silently later
 * as garbage ciphertext/plaintext.
 */
export function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();

  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY no está configurada. Configure cualquier cadena secreta no vacía " +
        "(se deriva de ella una clave AES-256 de 32 bytes)."
    );
  }

  if (cachedKey && cachedRaw === raw) {
    return cachedKey;
  }

  const derived = scryptSync(raw, KEY_DERIVATION_SALT, KEY_BYTES);
  cachedKey = derived;
  cachedRaw = raw;
  return derived;
}

/** Encrypts `plaintext`, returning `iv:authTag:ciphertext`, each base64. */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

/** Inverse of {@link encryptToken}. Throws if the payload is malformed, the
 * key doesn't match, or the ciphertext was tampered with (GCM auth tag). */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de token cifrado inválido.");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString("utf8");
}
