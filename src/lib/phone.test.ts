import { describe, expect, it } from "vitest";

import { normalizeMexicanMobile } from "./phone";

describe("normalizeMexicanMobile", () => {
  // Smoke test 2026-11-05: ru42 stores WhatsApp contacts as +52 + 10 digits.
  it("prefixes a bare 10-digit mobile with +52 (never +521)", () => {
    expect(normalizeMexicanMobile("8112345678")).toBe("+528112345678");
  });

  it("strips spaces, dashes and parentheses", () => {
    expect(normalizeMexicanMobile("55 1234 5678")).toBe("+525512345678");
    expect(normalizeMexicanMobile("(81) 1234-5678")).toBe("+528112345678");
  });

  it("accepts +52, 52, +521, 521 and the old 1 prefix, always returning +52", () => {
    for (const input of [
      "+52 55 1234 5678",
      "525512345678",
      "+52 1 55 1234 5678",
      "5215512345678",
      "1 55 1234 5678",
    ]) {
      expect(normalizeMexicanMobile(input)).toBe("+525512345678");
    }
  });

  it("rejects anything that cannot be a Mexican mobile", () => {
    for (const input of ["", "12345", "551234567", "+1 415 555 0100 12", "5312345678901", "abc"]) {
      expect(normalizeMexicanMobile(input)).toBeNull();
    }
  });
});
