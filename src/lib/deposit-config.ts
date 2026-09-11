import type { DepositThresholds } from "@/lib/deposit";

// Server-only: reads the three deposit env vars provisioned in Sprint 1
// (spec §11) and fails fast if any is missing or not a number, rather than
// silently producing NaN totals on a real contract.
export function getDepositThresholds(): DepositThresholds {
  const min = Number(process.env.MIN_CONTRACT_ADVANCE);
  const max = Number(process.env.MAX_CONTRACT_ADVANCE);
  const totalMin = Number(process.env.TOTAL_CONTRACT_MIN);

  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(totalMin)) {
    throw new Error(
      "Missing or invalid deposit threshold env vars: MIN_CONTRACT_ADVANCE, MAX_CONTRACT_ADVANCE, TOTAL_CONTRACT_MIN."
    );
  }

  return { min, max, totalMin };
}
