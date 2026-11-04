import { z } from "zod";

import {
  EventType,
  PaymentConcept,
  PaymentMethod,
  PaymentStatus,
} from "@/generated/prisma/enums";

// payment-receipt R1 — every value printed on a receipt, frozen inside
// registerPayment's locked transaction and stored as `payments.receipt_snapshot`.
// Every render (email attachment, public viewer, staff download) reads ONLY
// this object: a later payment, an edit of the contract (edit-precontract can
// change the client's name, the event and the total) or a rename of the user
// who recorded it never changes a receipt the client already holds.
//
// Money is stored in integer CENTS, never as peso floats: the receipt prints
// exactly what was computed in the transaction, with no float drift on the way
// back out (same reasoning as `toCents` in src/lib/payments/status.ts).
//
// Enum values (not their Spanish labels) are stored: the labels are code
// constants (`PAYMENT_CONCEPT_LABEL`, `PAYMENT_METHOD_LABEL`, …) and the schema
// below validates the values against the Prisma enums, so a corrupted row can
// never reach the renderer.
//
// Versioning: `v` is a literal. A future shape gets `v: 2` and a
// discriminated union here; v1 rows keep rendering exactly as issued.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const RECEIPT_SNAPSHOT_VERSION = 1;

const cents = z.number().int();

export const receiptSnapshotV1Schema = z.object({
  v: z.literal(RECEIPT_SNAPSHOT_VERSION),
  /** ISO-8601 instant the payment was registered — "Emitido el …". */
  issuedAt: z.iso.datetime(),
  paymentFolio: z.string().min(1),
  contractFolio: z.string().min(1),
  clientName: z.string().min(1),
  eventType: z.enum(EventType),
  /** `YYYY-MM-DD` (the contract's `@db.Date`, read in UTC). */
  eventDate: z.string().regex(ISO_DATE),
  amountCents: cents.positive(),
  method: z.enum(PaymentMethod),
  concept: z.enum(PaymentConcept),
  /** `YYYY-MM-DD` — the payment's own `@db.Date`. */
  paymentDate: z.string().regex(ISO_DATE),
  note: z.string().nullable(),
  contractTotalCents: cents,
  /** Cumulative paid INCLUDING this payment. */
  totalPaidCents: cents,
  /** `max(0, total − totalPaid)` — "Liquidado" when 0. */
  balanceCents: cents.nonnegative(),
  /** The contract's payment status right after this payment. */
  paymentStatus: z.enum(PaymentStatus),
  recordedByName: z.string().min(1),
});

export type ReceiptSnapshot = z.infer<typeof receiptSnapshotV1Schema>;

export interface BuildReceiptSnapshotInput {
  issuedAt: Date;
  paymentFolio: string;
  contractFolio: string;
  clientName: string;
  eventType: EventType;
  eventDate: Date;
  /** Pesos, as validated by `registerPaymentSchema`. */
  amount: number;
  method: PaymentMethod;
  concept: PaymentConcept;
  paymentDate: Date;
  note: string | null;
  contractTotalCents: number;
  totalPaidCents: number;
  paymentStatus: PaymentStatus;
  recordedByName: string | null | undefined;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Pure: the caller (registerPayment) supplies every figure from inside its
 * own transaction. Parsed through the schema on the way out, so an invalid
 * snapshot fails the transaction instead of being stored. */
export function buildReceiptSnapshot(input: BuildReceiptSnapshotInput): ReceiptSnapshot {
  return receiptSnapshotV1Schema.parse({
    v: RECEIPT_SNAPSHOT_VERSION,
    issuedAt: input.issuedAt.toISOString(),
    paymentFolio: input.paymentFolio,
    contractFolio: input.contractFolio,
    clientName: input.clientName,
    eventType: input.eventType,
    eventDate: isoDate(input.eventDate),
    amountCents: toCents(input.amount),
    method: input.method,
    concept: input.concept,
    paymentDate: isoDate(input.paymentDate),
    note: input.note?.trim() || null,
    contractTotalCents: input.contractTotalCents,
    totalPaidCents: input.totalPaidCents,
    balanceCents: Math.max(0, input.contractTotalCents - input.totalPaidCents),
    paymentStatus: input.paymentStatus,
    recordedByName: input.recordedByName?.trim() || "—",
  });
}

/** `null` for a payment that predates receipts (no snapshot) or for a stored
 * value that does not match any known version — both mean "no receipt". */
export function parseReceiptSnapshot(value: unknown): ReceiptSnapshot | null {
  if (value == null) {
    return null;
  }
  const parsed = receiptSnapshotV1Schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** `ComprobantePG-0007.jpg` — same `<Label><folio>.jpg` convention as
 * `clientFacingImageFileName` (`Contrato03142.jpg`). Used by the email
 * attachment, the public viewer's download and the staff download. */
export function receiptFileName(paymentFolio: string): string {
  return `Comprobante${paymentFolio}.jpg`;
}
