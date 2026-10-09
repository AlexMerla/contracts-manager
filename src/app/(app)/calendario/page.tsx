import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { auth } from "@/lib/auth";
import { scopeToOwner } from "@/lib/authorization";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EVENT_TYPE_CHART_TOKEN, EVENT_TYPE_LABEL } from "@/lib/event-type";
import type { EventType } from "@/generated/prisma/client";

import { DayList } from "./day-list";
import { EventDot, type CalendarEvent } from "./event-chip";
import { MonthGrid } from "./month-grid";
import {
  addMonths,
  monthBounds,
  monthLabel,
  monthName,
  monthParam,
  resolveMonth,
  todayInAppTimeZone,
} from "./month";

// `eventTime` is `@db.Time(6)`, which Prisma materialises on 1970-01-01 UTC —
// `timeZone: "UTC"` for the same reason `contratos/page.tsx` needs it on
// `eventDate`. `h23` (not the es-MX default 12-hour "08:30 p. m.") keeps the
// label to five characters so it fits on the chip's type line next to a label
// as long as "Graduación"; the contract detail page, which has room, keeps
// the 12-hour form.
const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

interface CalendarioPageProps {
  searchParams: Promise<{ mes?: string }>;
}

/**
 * Spec §5: `normal` sees only contracts where `createdById = self`, `super`
 * sees all — enforced at the data-access layer by `scopeToOwner`, not by
 * filtering in the view. The month's event count in the subtitle is derived
 * from that same scoped array, so there is no unscoped aggregate anywhere on
 * this page (sprint-08 task 6's "not even indirectly, e.g. via a shared
 * 'all events' count").
 */
export default async function CalendarioPage({ searchParams }: CalendarioPageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { mes } = await searchParams;
  const month = resolveMonth(mes);
  const bounds = monthBounds(month);

  const db = scopeToOwner(session);
  const contracts = await db.contract.findMany({
    where: { eventDate: { gte: bounds.gte, lt: bounds.lt } },
    orderBy: [{ eventDate: "asc" }, { eventTime: "asc" }, { clientName: "asc" }],
    select: {
      id: true,
      clientName: true,
      eventType: true,
      eventDate: true,
      eventTime: true,
      // Resolved Q6 — read ONLY to style the chip. The `where` above is
      // deliberately unchanged: a cancelled contract's event still appears
      // on the grid, still counts in the subtitle's event total and still
      // appears in the type legend. Excluding it is a separate, deferred
      // change.
      contractStatus: true,
    },
  });

  const eventsByDay = new Map<number, CalendarEvent[]>();
  const typeCounts = new Map<EventType, number>();

  for (const contract of contracts) {
    const day = contract.eventDate.getUTCDate();
    const event: CalendarEvent = {
      id: contract.id,
      day,
      clientName: contract.clientName,
      eventType: contract.eventType,
      timeLabel: contract.eventTime ? timeFormatter.format(contract.eventTime) : null,
      isCancelled: contract.contractStatus === "cancelled",
    };
    const existing = eventsByDay.get(day);
    if (existing) {
      existing.push(event);
    } else {
      eventsByDay.set(day, [event]);
    }
    typeCounts.set(contract.eventType, (typeCounts.get(contract.eventType) ?? 0) + 1);
  }

  // Legend shows only the types present this month (the mockup's September
  // lists 4 of 6), most frequent first — ties broken by chart index, which is
  // what reproduces the mockup's Boda / XV años / Graduación / Otro order.
  const legend = [...typeCounts.entries()].sort(
    ([aType, aCount], [bType, bCount]) =>
      bCount - aCount ||
      EVENT_TYPE_CHART_TOKEN[aType].localeCompare(EVENT_TYPE_CHART_TOKEN[bType])
  );

  const today = todayInAppTimeZone();
  const isCurrentMonth =
    today.getUTCFullYear() === month.year && today.getUTCMonth() === month.month;
  const todayDay = isCurrentMonth ? today.getUTCDate() : null;

  const previous = monthParam(addMonths(month, -1));
  const next = monthParam(addMonths(month, 1));

  const count = contracts.length;
  const subtitle =
    count === 0
      ? `Sin eventos en ${monthName(month)}.`
      : `${count} ${count === 1 ? "evento" : "eventos"} en ${monthName(month)}.`;

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle={subtitle}
        actions={
          <>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Mes anterior"
              render={<Link href={`/calendario?mes=${previous}`} />}
            >
              <Icon icon={ChevronLeft} />
            </Button>
            <span className="min-w-[9.5rem] rounded-lg border px-3 py-1.5 text-center text-sm font-medium">
              {monthLabel(month)}
            </span>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Mes siguiente"
              render={<Link href={`/calendario?mes=${next}`} />}
            >
              <Icon icon={ChevronRight} />
            </Button>
          </>
        }
      />
      <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
        {legend.length > 0 ? (
          <ul className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            {legend.map(([eventType]) => (
              <li key={eventType} className="flex items-center gap-1.5 text-[13px]">
                <EventDot eventType={eventType} />
                {EVENT_TYPE_LABEL[eventType]}
              </li>
            ))}
          </ul>
        ) : null}
        <MonthGrid month={month} eventsByDay={eventsByDay} todayDay={todayDay} />
        <DayList month={month} eventsByDay={eventsByDay} todayDay={todayDay} />
      </div>
    </>
  );
}
