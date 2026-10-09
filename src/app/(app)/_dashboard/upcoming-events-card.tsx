import { CalendarDays } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Money } from "@/components/money";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";
import { UPCOMING_WINDOW_DAYS, type DashboardContract } from "@/lib/dashboard/dashboard-data";

import { formatEventDate } from "./recent-contracts-card";

/**
 * "Próximos eventos". The list is the first `UPCOMING_EVENTS_LIMIT` of the
 * SAME set the PRÓXIMOS EVENTOS KPI counts — same window, same exclusions —
 * so a reader can never see "14 en los próximos 30 días" above a list drawn
 * from some other range. The card says how many more there are rather than
 * silently truncating.
 *
 * `tone="auto"` is the collection-progress banding from design-system §2
 * (amber → indigo → green), which is domain logic living in `Progress`, not
 * a colour choice made here.
 */
export function UpcomingEventsCard({
  rows,
  totalCount,
}: {
  rows: readonly DashboardContract[];
  totalCount: number;
}) {
  const hidden = totalCount - rows.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximos eventos</CardTitle>
        <CardDescription>
          {totalCount === 0
            ? `Sin eventos en los próximos ${UPCOMING_WINDOW_DAYS} días.`
            : `Próximos ${UPCOMING_WINDOW_DAYS} días.`}
        </CardDescription>
      </CardHeader>
      <CardContent className={rows.length === 0 ? "p-0" : undefined}>
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No hay eventos próximos."
            description={`Ningún contrato tiene su evento dentro de los próximos ${UPCOMING_WINDOW_DAYS} días.`}
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row) => {
              // `max` must stay positive: a zero total would make the
              // percentage a division by zero, and an overpaid contract
              // would push the indicator past the track.
              const max = row.total > 0 ? row.total : 1;
              return (
                <li key={row.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{row.clientName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatEventDate(row.eventDateIso)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span>{EVENT_TYPE_LABEL[row.eventType]}</span>
                    <span className="shrink-0">
                      <Money amount={row.collected} /> de <Money amount={row.total} />
                    </span>
                  </div>
                  <Progress
                    value={Math.min(row.collected, max)}
                    max={max}
                    tone="auto"
                    aria-label={`Cobrado de ${row.clientName}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {hidden === 1 ? "Y 1 evento más en el periodo." : `Y ${hidden} eventos más en el periodo.`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
