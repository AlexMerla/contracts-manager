import type { EventType } from "@/generated/prisma/client";
import { EVENT_TYPE_CHART_TOKEN, EVENT_TYPE_LABEL, chartTokenVar } from "@/lib/event-type";
import { cn } from "@/lib/utils";

/** One contract, flattened for rendering. Decimal/Date values are already
 *  converted or formatted on the server — nothing here crosses the RSC
 *  boundary unserialised (same discipline as `contratos/page.tsx`). */
export interface CalendarEvent {
  readonly id: string;
  readonly day: number;
  readonly clientName: string;
  readonly eventType: EventType;
  /** `HH:mm`, or `null` when `contracts.eventTime` is null. */
  readonly timeLabel: string | null;
}

/** The legend swatch and the chip's leading dot are the same 6px disc. */
export function EventDot({ eventType, className }: { eventType: EventType; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: chartTokenVar(EVENT_TYPE_CHART_TOKEN[eventType]) }}
    />
  );
}

/**
 * Two-line block on a muted surface, per the mockup: a micro type line
 * (dot + Spanish label, plus the time when the contract has one) over the
 * client name. Deliberately not a `<Badge>` — Badge's variants are the fixed
 * semantic status tones (success/warning/danger/info) and event type is a
 * categorical dimension, not a status.
 */
export function EventChip({ event }: { event: CalendarEvent }) {
  return (
    <div className="rounded-md bg-muted/70 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <EventDot eventType={event.eventType} />
        <span className="truncate text-[11px] leading-none text-muted-foreground">
          {EVENT_TYPE_LABEL[event.eventType]}
        </span>
        {event.timeLabel ? (
          <span className="ml-auto shrink-0 font-mono text-[11px] leading-none text-muted-foreground">
            {event.timeLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-1 truncate text-[13px] leading-tight" title={event.clientName}>
        {event.clientName}
      </p>
    </div>
  );
}
