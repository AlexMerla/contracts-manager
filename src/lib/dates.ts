/**
 * Shared calendar-date helpers for `@db.Date` columns.
 *
 * Every date column in this schema (`contracts.eventDate`,
 * `payments.paymentDate`) is `@db.Date`, which Prisma materialises as UTC
 * midnight. Doing arithmetic on those values with local-time `Date`
 * constructors reproduces the off-by-one day the project already hit in
 * `src/app/(app)/contratos/page.tsx` (see its `timeZone: "UTC"` comment), so
 * everything here is UTC-based on purpose.
 *
 * `APP_TIME_ZONE` / `todayInAppTimeZone` used to live in
 * `src/app/(app)/calendario/month.ts`. They moved here when the dashboard
 * needed them too: a `src/lib/*` module importing from a route folder would
 * invert the dependency direction. `month.ts` re-exports both, so its own
 * public API is unchanged.
 */

/** The business operates in Mexico (spec §0). Mirrors `EVENT_TIME_ZONE` in
 *  `src/lib/google/calendar.ts`, duplicated so neither the calendar page nor
 *  the dashboard has to import the googleapis-adjacent module for a string. */
export const APP_TIME_ZONE = "America/Mexico_City";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * "Today" as the operator in Mexico experiences it, normalised to UTC
 * midnight so it is directly comparable with an `@db.Date` value. A server
 * running in UTC would otherwise consider it "tomorrow" after 18:00 local.
 */
export function todayInAppTimeZone(now: Date = new Date()): Date {
  const parts = partsFormatter.formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };
  return new Date(Date.UTC(read("year"), read("month") - 1, read("day")));
}

/** `Date` -> `YYYY-MM-DD`, read in UTC. Comparable and sortable as a plain
 *  string — the same representation `ReportRow.eventDateIso` uses. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` ± n days, with month/year rollover handled by `Date.UTC`. */
export function addDaysIso(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return toIsoDate(base);
}

/** `YYYY-MM-DD` -> `YYYY-MM`. Month bucketing is a string slice on purpose:
 *  no `Date` is constructed, so no timezone can shift the bucket. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** `YYYY-MM` ± n months. */
export function addMonthsToKey(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7)) - 1;
  const shifted = new Date(Date.UTC(year, month + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

const monthNameFormatter = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  timeZone: "UTC",
});

/** `"2026-08"` -> `"agosto"` (lowercase, for inline prose). */
export function monthNameOfKey(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7)) - 1;
  return monthNameFormatter.format(new Date(Date.UTC(year, month, 1)));
}

/** `"2026-09"` -> `"Septiembre 2026"`. */
export function monthLabelOfKey(monthKey: string): string {
  const name = monthNameOfKey(monthKey);
  return `${name.charAt(0).toLocaleUpperCase("es-MX")}${name.slice(1)} ${monthKey.slice(0, 4)}`;
}
