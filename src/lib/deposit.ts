export interface DepositThresholds {
  min: number;
  max: number;
  totalMin: number;
}

/**
 * Legacy default-deposit rule (spec §6.4, ported from the legacy
 * `calculateFinalTotals`): a flat minimum advance when the contract's total
 * is at or below the threshold, a flat maximum advance otherwise — not
 * proportional to `total`. This can make `deposit > total` for a contract
 * just above the threshold; that mirrors the legacy behavior exactly and is
 * why spec §8 step 5 lets the user override the proposed deposit before
 * confirming.
 *
 * Pure and framework-agnostic on purpose: used both server-side (to seed the
 * wizard's step 5) and client-side (to keep the proposal live as amounts
 * change), so it must not read `process.env` itself — see
 * `getDepositThresholds` in `deposit-config.ts` for that.
 */
export function calculateDefaultDeposit(
  total: number,
  thresholds: DepositThresholds
): number {
  return total <= thresholds.totalMin ? thresholds.min : thresholds.max;
}
