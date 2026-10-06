import type { PaymentStatus } from "@/generated/prisma/client";

export interface ResolvePaymentStatusArgs {
  /** The contract's `paymentStatus` read INSIDE the same transaction as the
   * write, i.e. the state *before* this payment is accounted for. */
  previousStatus: PaymentStatus;
  /** Cumulative paid amount INCLUDING the payment currently being written. */
  totalPaid: number;
  /** `contracts.deposit` — a creation-time snapshot, never recomputed. */
  deposit: number;
  /** `contracts.total` — a creation-time snapshot, never recomputed. */
  total: number;
}

// All comparisons happen in integer cents, never on the raw peso floats:
// `Decimal(10,2)` values read back as JS `number` are floats, and
// `0.1 + 0.2 >= 0.3` is `false` in IEEE 754 — a fully-paid contract could
// stall at "partial" purely from float drift. Rounding to the nearest cent
// before comparing sidesteps that entirely (design decision #5).
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Pure transition rule for `payments.paymentStatus` (spec §12.6 / sprint-08
 * domain: Payments, "ADDED: Payment Status Transition"). Framework- and
 * database-agnostic on purpose so it's testable without a transaction or a
 * live connection — `registerPayment` is the only caller, and always reads
 * `previousStatus`/`totalPaid` from inside its own `$transaction`.
 *
 * Order of checks is load-bearing (design decision #4): `paid >= total` is
 * checked BEFORE `paid < deposit`, because `calculateDefaultDeposit`
 * (src/lib/deposit.ts) can legitimately produce `deposit > total` for a
 * contract just above its threshold. Checking the deposit first would read
 * such an already-fully-paid contract as "pending" — checking "paid in
 * full" first means it is never misclassified regardless of how `deposit`
 * and `total` relate to each other.
 *
 * "Crossing the deposit" is detected via `previousStatus === "pending"`
 * (design decision #3), NOT `previousPaid < deposit`: the latter silently
 * breaks when `deposit = 0` (`previousPaid < 0` is never true), which would
 * leave a zero-deposit contract stuck at "pending" forever instead of
 * confirming on its very first payment.
 */
export function resolvePaymentStatus({
  previousStatus,
  totalPaid,
  deposit,
  total,
}: ResolvePaymentStatusArgs): PaymentStatus {
  const paidCents = toCents(totalPaid);
  const depositCents = toCents(deposit);
  const totalCents = toCents(total);

  if (paidCents >= totalCents) {
    return "paid_in_full";
  }
  if (paidCents < depositCents) {
    return "pending";
  }
  return previousStatus === "pending" ? "deposit_paid" : "partial";
}
