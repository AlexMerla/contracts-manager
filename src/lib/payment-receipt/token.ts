import { randomBytes } from "node:crypto";

const RECEIPT_TOKEN_BYTES = 32;

/**
 * The public identifier of a payment receipt (spec §10): 256 bits from the
 * OS CSPRNG, base64url-encoded — 43 characters of `[A-Za-z0-9_-]`, safe in a
 * URL path with no escaping and in a HighLevel custom field. Never derived from
 * the payment's internal id or folio, so it can't be guessed or enumerated.
 */
export function generateReceiptToken(): string {
  return randomBytes(RECEIPT_TOKEN_BYTES).toString("base64url");
}
