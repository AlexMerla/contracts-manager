import type { EventType } from "@/generated/prisma/client";

// Fixed event-type vocabulary → Spanish label mapping. Domain logic, must
// match the Prisma enum exactly (spec §0: DB identifiers in English, product-
// facing text in Spanish) — same pattern as `PAYMENT_STATUS_LABEL` in
// `src/components/status-pill.tsx`. Doubles as the `items` prop for any
// `<Select>` that lets the user pick an event type.
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  quinceanera: "XV años",
  wedding: "Boda",
  birthday: "Cumpleaños",
  graduation: "Graduación",
  posada: "Posada",
  other: "Otro",
};

/** The categorical palette from docs/design-system.md §1.1, in its fixed
 *  order: indigo, magenta, violet, teal, orange, sky, green, gray. */
export type ChartToken =
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "chart-6"
  | "chart-7"
  | "chart-8";

/**
 * Canonical event-type → chart-token assignment. Pinned here (not in the
 * calendar) so the Sprint 8 dashboard can import it without pulling in any
 * calendar code, and so the same event type is the same colour everywhere —
 * design-system.md §1.1: "the same index must mean the same series across
 * every chart in the app".
 *
 * 1/2/4/6 are read directly off the Calendario mockup. 5 (orange) and 7
 * (green) are assigned to the two types that mockup's month does not contain;
 * see the design artifact for why those two, and not 3 (violet) / 8 (gray).
 */
export const EVENT_TYPE_CHART_TOKEN: Record<EventType, ChartToken> = {
  wedding: "chart-1",
  graduation: "chart-2",
  quinceanera: "chart-4",
  birthday: "chart-5",
  other: "chart-6",
  posada: "chart-7",
};

/**
 * Chart tokens must be read through `var(--chart-N)`, not interpolated into a
 * Tailwind class: Tailwind v4 only emits utilities whose class names appear
 * literally in the source, so a template-literal `bg-${token}` silently
 * produces no CSS. Using the custom property keeps one map instead of a
 * parallel hard-coded class map.
 */
export function chartTokenVar(token: ChartToken): string {
  return `var(--${token})`;
}
