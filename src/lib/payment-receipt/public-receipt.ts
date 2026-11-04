import { prisma } from "@/lib/prisma";

import { parseReceiptSnapshot, type ReceiptSnapshot } from "./snapshot";

// Both generated token formats (the app's base64url and the migration
// default's hex) fit this; anything else can't be a token, so it is answered
// without a query.
const RECEIPT_TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * The public receipt viewer's ONLY lookup (spec §10): by `receipt_token`,
 * never by id. `null` — rendered by every caller as the same generic 404 — for
 * a malformed token, an unknown token, a payment whose contract is
 * `cancelled` (same "cancelled shows the client nothing" rule as the contract
 * viewer), and a payment that predates receipts. Nothing distinguishes these
 * cases to a prober.
 */
export async function findPublicReceipt(receiptToken: string): Promise<ReceiptSnapshot | null> {
  if (!RECEIPT_TOKEN_SHAPE.test(receiptToken)) {
    return null;
  }
  const payment = await prisma.payment.findUnique({
    where: { receiptToken },
    select: { receiptSnapshot: true, contract: { select: { contractStatus: true } } },
  });
  if (!payment || payment.contract.contractStatus === "cancelled") {
    return null;
  }
  return parseReceiptSnapshot(payment.receiptSnapshot);
}
