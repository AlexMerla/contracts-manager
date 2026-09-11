import { describe, expect, it } from "vitest";

import { calculateDefaultDeposit } from "@/lib/deposit";

// Spec §6.4's legacy threshold rule: fixed minimum at-or-below the
// threshold, fixed maximum above it — not proportional to `total`.
describe("calculateDefaultDeposit", () => {
  const thresholds = { min: 1000, max: 3000, totalMin: 1500 };

  it("returns the fixed minimum when total is below the threshold", () => {
    expect(calculateDefaultDeposit(1000, thresholds)).toBe(1000);
  });

  it("returns the fixed minimum when total equals the threshold exactly", () => {
    expect(calculateDefaultDeposit(1500, thresholds)).toBe(1000);
  });

  it("returns the fixed maximum when total is above the threshold", () => {
    expect(calculateDefaultDeposit(1501, thresholds)).toBe(3000);
  });

  it("returns the fixed maximum for a large total", () => {
    expect(calculateDefaultDeposit(50000, thresholds)).toBe(3000);
  });
});
