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
  /**
   * PRESENTATION ONLY (resolved Q6 of the contract-cancellation change). The
   * event STAYS on the grid and still counts in the month's event total and
   * in the type legend — `page.tsx`'s month query is untouched. Removing
   * cancelled events from the calendar is a separate, deferred change.
   */
  readonly isCancelled: boolean;
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
    <div
      className={cn(
        "rounded-md px-2 py-1.5",
        // Cancelled: the whole chip recedes and the type line is replaced by
        // the word "Cancelado" in the `danger` tone. Deliberately NOT a
        // `<Badge>` — Badge is 20px tall and this chip's type line is 11px;
        // the tone tokens are the same ones Badge's `danger` variant uses, so
        // the vocabulary matches even though the box does not.
        event.isCancelled ? "bg-danger-bg/40" : "bg-muted/70"
      )}
    >
      <div className="flex items-center gap-1.5">
        <EventDot eventType={event.eventType} className={event.isCancelled ? "opacity-40" : undefined} />
        <span
          className={cn(
            "truncate text-[11px] leading-none",
            event.isCancelled ? "font-medium text-danger-fg" : "text-muted-foreground"
          )}
        >
          {event.isCancelled ? "Cancelado" : EVENT_TYPE_LABEL[event.eventType]}
        </span>
        {event.timeLabel ? (
          <span className="ml-auto shrink-0 font-mono text-[11px] leading-none text-muted-foreground">
            {event.timeLabel}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[13px] leading-tight",
          event.isCancelled && "text-muted-foreground line-through"
        )}
        title={
          event.isCancelled
            ? `${event.clientName} — ${EVENT_TYPE_LABEL[event.eventType]} (cancelado)`
            : event.clientName
        }
      >
        {event.clientName}
      </p>
    </div>
  );
}
