import { describe, expect, it } from "vitest";

import { resolvePaymentStatus } from "./status";

describe("resolvePaymentStatus", () => {
  it("stays pending while cumulative paid is below the deposit", () => {
    expect(
      resolvePaymentStatus({ previousStatus: "pending", totalPaid: 500, deposit: 1000, total: 5000 })
    ).toBe("pending");
  });

  it("flips pending -> deposit_paid exactly when crossing the deposit threshold", () => {
    expect(
      resolvePaymentStatus({ previousStatus: "pending", totalPaid: 1000, deposit: 1000, total: 5000 })
    ).toBe("deposit_paid");
  });

  it("reports partial for a second payment that does not reach total, from a non-pending state", () => {
    expect(
      resolvePaymentStatus({
        previousStatus: "deposit_paid",
        totalPaid: 3000,
        deposit: 1000,
        total: 5000,
      })
    ).toBe("partial");
  });

  it("reports paid_in_full once cumulative paid reaches or exceeds total", () => {
    expect(
      resolvePaymentStatus({ previousStatus: "partial", totalPaid: 5000, deposit: 1000, total: 5000 })
    ).toBe("paid_in_full");
  });

  it("reports paid_in_full on overpayment past the total", () => {
    expect(
      resolvePaymentStatus({ previousStatus: "partial", totalPaid: 6000, deposit: 1000, total: 5000 })
    ).toBe("paid_in_full");
  });

  // Design decision #4: order of checks matters when `deposit > total`
  // (calculateDefaultDeposit can legitimately produce this just above its
  // threshold). A fully-paid contract must read paid_in_full, never pending.
  it("reports paid_in_full even when deposit is greater than total", () => {
    expect(
      resolvePaymentStatus({ previousStatus: "pending", totalPaid: 5000, deposit: 6000, total: 5000 })
    ).toBe("paid_in_full");
  });

  // Design decision #3: previousStatus === "pending" is the crossing test,
  // not previousPaid < deposit — the latter breaks silently at deposit = 0.
  it("flips pending -> deposit_paid on the very first payment when deposit is zero", () => {
    expect(
      resolvePaymentStatus({ previousStatus: "pending", totalPaid: 100, deposit: 0, total: 5000 })
    ).toBe("deposit_paid");
  });

  // Design decision #5: integer-cent comparison avoids float drift like
  // 0.1 + 0.2 >= 0.3 being false in IEEE 754.
  it("treats 0.1 + 0.2 reaching 0.3 as fully paid, not stuck at partial", () => {
    expect(
      resolvePaymentStatus({ previousStatus: "partial", totalPaid: 0.1 + 0.2, deposit: 0.1, total: 0.3 })
    ).toBe("paid_in_full");
  });
});
