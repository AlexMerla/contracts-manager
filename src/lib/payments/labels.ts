import type { PaymentConcept, PaymentMethod } from "@/generated/prisma/client";

// Fixed vocabulary → Spanish label mapping, same pattern as
// `EVENT_TYPE_LABEL` (src/lib/event-type.ts) and `PAYMENT_STATUS_LABEL`
// (src/components/status-pill.tsx) — domain logic, must match the Prisma
// enums exactly (spec §0). Both maps live in one file (design decision #8):
// they're always read together by the same dialog and the same table, so
// two 15-line files would split for no reader's benefit.
//
// `concept` is always user-chosen at registration time, never derived from
// contract state — see `registerPayment` and spec §12.6's note that the
// concept the user picks ("depósito", "abono", "liquidación", "otro") is
// independent of the payment-status transition the same payment may trigger.
export const PAYMENT_CONCEPT_LABEL: Record<PaymentConcept, string> = {
  deposit: "Anticipo",
  installment: "Abono",
  settlement: "Liquidación",
  other: "Otro",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

// Ordered tuples for the `<Select>` controls and for zod's `z.enum(...)` —
// object key order isn't guaranteed to be stable across engines/transpiles
// for iteration purposes, so these are declared explicitly rather than
// derived with `Object.keys(...)`.
export const PAYMENT_CONCEPTS = ["deposit", "installment", "settlement", "other"] as const;
export const PAYMENT_METHODS = ["cash", "bank_transfer", "card", "other"] as const;
