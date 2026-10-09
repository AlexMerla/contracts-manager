/**
 * Pure month arithmetic for `/calendario`. Everything here is UTC-based on
 * purpose: `contracts.eventDate` is `@db.Date`, which Prisma materialises as
 * UTC midnight. Doing any of this with local-time `Date` constructors would
 * reproduce the off-by-one day the project already hit in
 * `src/app/(app)/contratos/page.tsx` (see its `timeZone: "UTC"` comment).
 *
 * `APP_TIME_ZONE` and `todayInAppTimeZone` moved to `src/lib/dates.ts` when
 * the Sprint-8 dashboard needed them as well — a `src/lib/*` module importing
 * from a route folder would invert the dependency direction. They are
 * re-exported here so this module's public API is unchanged.
 */

import { APP_TIME_ZONE, todayInAppTimeZone } from "@/lib/dates";

export { APP_TIME_ZONE, todayInAppTimeZone };

/** A calendar month. `month` is 0-indexed, like `Date.getUTCMonth()`. */
export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/;

const monthNameFormatter = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  timeZone: "UTC",
});

/** `?mes=YYYY-MM` → month. Anything malformed or absent falls back to today. */
export function resolveMonth(mes: string | undefined, now: Date = new Date()): CalendarMonth {
  const match = mes ? MONTH_PARAM.exec(mes) : null;
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) - 1 };
  }
  const today = todayInAppTimeZone(now);
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() };
}

/** Month → the `?mes=` value that round-trips through `resolveMonth`. */
export function monthParam({ year, month }: CalendarMonth): string {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
}

/** Month ± n, with year rollover handled by `Date.UTC`'s own normalisation. */
export function addMonths({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const shifted = new Date(Date.UTC(year, month + delta, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

/** Half-open `[gte, lt)` bounds for the Prisma `eventDate` range filter. */
export function monthBounds(month: CalendarMonth): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(month.year, month.month, 1)),
    lt: new Date(Date.UTC(month.year, month.month + 1, 1)),
  };
}

/** Monday-first offset: 0 when the 1st is a Monday, 6 when it is a Sunday. */
export function leadingBlanks({ year, month }: CalendarMonth): number {
  return (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
}

/** Day 0 of the next month is the last day of this one. */
export function daysInMonth({ year, month }: CalendarMonth): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * The grid, row-major, always a whole number of weeks. `null` is an
 * out-of-month cell — rendered blank, never with an adjacent month's day
 * number (per the mockup).
 */
export function monthCells(month: CalendarMonth): (number | null)[] {
  const cells: (number | null)[] = Array.from({ length: leadingBlanks(month) }, () => null);
  const total = daysInMonth(month);
  for (let day = 1; day <= total; day += 1) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

/** "septiembre" — lowercase, for the "N eventos en …" subtitle. */
export function monthName({ year, month }: CalendarMonth): string {
  return monthNameFormatter.format(new Date(Date.UTC(year, month, 1)));
}

/** "Septiembre 2026" — the static label between the nav chevrons. */
export function monthLabel(month: CalendarMonth): string {
  const name = monthName(month);
  return `${name.charAt(0).toLocaleUpperCase("es-MX")}${name.slice(1)} ${month.year}`;
}

/** Fixed Spanish headers. Product-facing text is es-MX (spec §0), so these are
 *  a constant rather than an `Intl` call that would emit "lun." with a dot. */
export const WEEKDAY_HEADERS: readonly string[] = [
  "LUN",
  "MAR",
  "MIÉ",
  "JUE",
  "VIE",
  "SÁB",
  "DOM",
];
