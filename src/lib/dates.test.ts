import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  addMonthsToKey,
  monthKeyOf,
  monthLabelOfKey,
  monthNameOfKey,
  toIsoDate,
  todayInAppTimeZone,
} from "@/lib/dates";

describe("lib/dates", () => {
  it("todayInAppTimeZone returns the Mexico-City civil date at UTC midnight", () => {
    // 2026-10-01 02:00 UTC is still 2026-09-30 20:00 in Mexico City.
    expect(todayInAppTimeZone(new Date("2026-10-01T02:00:00Z")).toISOString()).toBe(
      "2026-09-30T00:00:00.000Z"
    );
  });

  it("toIsoDate reads the UTC calendar day", () => {
    expect(toIsoDate(new Date("2026-09-04T00:00:00Z"))).toBe("2026-09-04");
  });

  it("addDaysIso rolls over months and years", () => {
    expect(addDaysIso("2026-09-04", 30)).toBe("2026-10-04");
    expect(addDaysIso("2026-12-20", 15)).toBe("2027-01-04");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("monthKeyOf is a pure string slice — no Date, no timezone", () => {
    expect(monthKeyOf("2026-09-30")).toBe("2026-09");
  });

  it("addMonthsToKey rolls the year over in both directions", () => {
    expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
    expect(addMonthsToKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToKey("2026-09", -1)).toBe("2026-08");
  });

  it("formats month names and labels in es-MX", () => {
    expect(monthNameOfKey("2026-08")).toBe("agosto");
    expect(monthLabelOfKey("2026-09")).toBe("Septiembre 2026");
  });
});
