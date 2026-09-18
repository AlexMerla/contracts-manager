import type { EventType } from "@/generated/prisma/client";

// Fixed event-type vocabulary → Spanish label mapping. Domain logic, must
// match the Prisma enum exactly (spec §0: DB identifiers in English, product-
// facing text in Spanish) — same pattern as `PAYMENT_STATUS_LABEL` in
// `src/components/status-pill.tsx`. Doubles as the `items` prop for any
// `<Select>` that lets the user pick an event type.
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  quinceanera: "XV",
  wedding: "Boda",
  birthday: "Cumpleaños",
  graduation: "Graduación",
  posada: "Posada",
  other: "Otro",
};
