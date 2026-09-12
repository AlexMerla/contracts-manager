import { describe, expect, it } from "vitest";

import { formatMoney } from "./format-money";

// Spec §7: money fields on the contract image use
// Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }) — same
// rule as the on-screen Money component, just as a plain function since
// canvas text can't be JSX.
describe("formatMoney", () => {
  it("formats a value under $10", () => {
    expect(formatMoney(5)).toBe("$5.00");
  });

  it("formats a value under $10 with cents", () => {
    expect(formatMoney(9.5)).toBe("$9.50");
  });

  it("formats a value over $10,000 with thousands separators", () => {
    expect(formatMoney(12345.5)).toBe("$12,345.50");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("formats a mid-range value", () => {
    expect(formatMoney(3500)).toBe("$3,500.00");
  });
});
