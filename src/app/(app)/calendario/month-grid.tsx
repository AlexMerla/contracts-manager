import { WEEKDAY_HEADERS, monthCells, type CalendarMonth } from "./month";
import { EventChip, type CalendarEvent } from "./event-chip";

/** Chips rendered in full before the cell collapses into "+N más". Three is
 *  the most the mockup's row height absorbs without the week rows growing
 *  unevenly; the mockup's busiest cell holds two. */
export const MAX_CHIPS_PER_CELL = 3;

interface MonthGridProps {
  month: CalendarMonth;
  /** day-of-month (1-31) → that day's events, already sorted. */
  eventsByDay: ReadonlyMap<number, readonly CalendarEvent[]>;
  /** Day-of-month of "today", or `null` when the viewed month isn't the
   *  current one — the highlight must not appear on every month. */
  todayDay: number | null;
}

export function MonthGrid({ month, eventsByDay, todayDay }: MonthGridProps) {
  const cells = monthCells(month);

  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
      <div className="grid grid-cols-7 border-b bg-card">
        {WEEKDAY_HEADERS.map((weekday) => (
          <div
            key={weekday}
            className="px-3 py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, index) => {
          if (day === null) {
            return (
              <div
                key={`blank-${index}`}
                aria-hidden
                className="min-h-[7.5rem] border-r border-b bg-muted/30 last:border-r-0 [&:nth-child(7n)]:border-r-0"
              />
            );
          }

          const events = eventsByDay.get(day) ?? [];
          const visible = events.slice(0, MAX_CHIPS_PER_CELL);
          const hidden = events.slice(MAX_CHIPS_PER_CELL);
          const isToday = day === todayDay;

          return (
            <div
              key={day}
              className="min-h-[7.5rem] border-r border-b p-2 last:border-r-0 [&:nth-child(7n)]:border-r-0"
            >
              <span
                className={
                  isToday
                    ? "flex size-6 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background"
                    : "flex size-6 items-center justify-center text-xs text-muted-foreground"
                }
                aria-current={isToday ? "date" : undefined}
              >
                {day}
              </span>
              {events.length > 0 ? (
                <div className="mt-1 flex flex-col gap-1">
                  {visible.map((event) => (
                    <EventChip key={event.id} event={event} />
                  ))}
                  {hidden.length > 0 ? (
                    // A hard cap would make these events unreachable. `<details>`
                    // keeps the cell compact but expands in place on click *and*
                    // on Enter/Space — discoverable without a line of client JS.
                    // A `title` tooltip was the first attempt and is not enough:
                    // it is invisible to keyboard and touch.
                    <details className="group/overflow">
                      <summary className="cursor-pointer list-none rounded px-2 text-[11px] text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                        <span className="group-open/overflow:hidden">{`+${hidden.length} más`}</span>
                        <span className="hidden group-open/overflow:inline">Ver menos</span>
                      </summary>
                      <div className="mt-1 flex flex-col gap-1">
                        {hidden.map((event) => (
                          <EventChip key={event.id} event={event} />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
