import { describe, expect, it } from "vitest";

import {
  addMonths,
  daysInMonth,
  leadingBlanks,
  monthBounds,
  monthCells,
  monthLabel,
  monthName,
  monthParam,
  resolveMonth,
  todayInAppTimeZone,
} from "./month";

describe("calendario/month", () => {
  it("resolves a valid ?mes= param", () => {
    expect(resolveMonth("2026-09")).toEqual({ year: 2026, month: 8 });
    expect(resolveMonth("2026-01")).toEqual({ year: 2026, month: 0 });
    expect(resolveMonth("2026-12")).toEqual({ year: 2026, month: 11 });
  });

  it("falls back to the current Mexico-City month on a missing or malformed param", () => {
    // 2026-09-30 23:30 UTC is still 2026-09-30 17:30 in Mexico City.
    const now = new Date("2026-09-30T23:30:00Z");
    for (const bad of [undefined, "", "2026-13", "2026-00", "septiembre", "2026-9"]) {
      expect(resolveMonth(bad, now)).toEqual({ year: 2026, month: 8 });
    }
  });

  it("todayInAppTimeZone returns the Mexico-City civil date at UTC midnight", () => {
    // 2026-10-01 02:00 UTC is still 2026-09-30 20:00 in Mexico City.
    expect(todayInAppTimeZone(new Date("2026-10-01T02:00:00Z")).toISOString()).toBe(
      "2026-09-30T00:00:00.000Z"
    );
  });

  it("round-trips through monthParam", () => {
    expect(monthParam({ year: 2026, month: 8 })).toBe("2026-09");
    expect(resolveMonth(monthParam({ year: 2027, month: 11 }))).toEqual({
      year: 2027,
      month: 11,
    });
  });

  it("addMonths rolls the year over in both directions", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("monthBounds is a half-open UTC range", () => {
    const bounds = monthBounds({ year: 2026, month: 8 });
    expect(bounds.gte.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(bounds.lt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("monthBounds wraps December into the next year", () => {
    const bounds = monthBounds({ year: 2026, month: 11 });
    expect(bounds.gte.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(bounds.lt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("leadingBlanks is Monday-first", () => {
    // 2026-09-01 is a Tuesday -> one blank.
    expect(leadingBlanks({ year: 2026, month: 8 })).toBe(1);
    // 2026-02-01 is a Sunday -> six blanks.
    expect(leadingBlanks({ year: 2026, month: 1 })).toBe(6);
    // 2026-06-01 is a Monday -> none.
    expect(leadingBlanks({ year: 2026, month: 5 })).toBe(0);
  });

  it("daysInMonth handles leap years", () => {
    expect(daysInMonth({ year: 2026, month: 1 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 1 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 8 })).toBe(30);
  });

  it("monthCells pads to whole weeks and matches the mockup's September 2026", () => {
    const cells = monthCells({ year: 2026, month: 8 });
    expect(cells).toHaveLength(35);
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBe(1);
    // Day 4 (the mockup's "today") must land in the Friday column.
    expect(cells.indexOf(4) % 7).toBe(4);
    // Day 12 must land in the Saturday column.
    expect(cells.indexOf(12) % 7).toBe(5);
    expect(cells[cells.length - 1]).toBeNull();
    expect(cells.filter((cell) => cell !== null)).toHaveLength(30);
  });

  it("formats the month label and name in es-MX", () => {
    expect(monthName({ year: 2026, month: 8 })).toBe("septiembre");
    expect(monthLabel({ year: 2026, month: 8 })).toBe("Septiembre 2026");
    expect(monthLabel({ year: 2026, month: 11 })).toBe("Diciembre 2026");
  });
});
