import { WEEKDAY_HEADERS, type CalendarMonth } from "./month";
import { EventChip, type CalendarEvent } from "./event-chip";

interface DayListProps {
  month: CalendarMonth;
  eventsByDay: ReadonlyMap<number, readonly CalendarEvent[]>;
  todayDay: number | null;
}

/**
 * Narrow-viewport fallback for `MonthGrid`. Seven columns cannot hold a
 * readable client name on a phone, so below `md` (768px — the same breakpoint
 * `app-shell.tsx` uses to expand the sidebar) the month collapses to a
 * chronological list of only the days that actually have events. Same data,
 * same server render, no client JS and no duplicate query.
 */
export function DayList({ month, eventsByDay, todayDay }: DayListProps) {
  const days = [...eventsByDay.keys()].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {days.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
          Sin eventos este mes.
        </p>
      ) : (
        days.map((day) => {
          const weekday = WEEKDAY_HEADERS[(new Date(Date.UTC(month.year, month.month, day)).getUTCDay() + 6) % 7];
          return (
            <section key={day} className="rounded-xl border bg-card p-3 shadow-sm">
              <h2 className="mb-2 text-xs font-medium text-muted-foreground">
                <span
                  className={
                    day === todayDay
                      ? "mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-foreground text-background"
                      : "mr-1.5"
                  }
                >
                  {day}
                </span>
                {weekday}
              </h2>
              <div className="flex flex-col gap-1">
                {(eventsByDay.get(day) ?? []).map((event) => (
                  <EventChip key={event.id} event={event} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
