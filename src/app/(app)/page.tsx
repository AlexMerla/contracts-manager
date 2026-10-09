import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, FileText, TrendingUp, TriangleAlert, Wallet } from "lucide-react";

import { auth } from "@/lib/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import {
  ALERT_WINDOW_DAYS,
  UPCOMING_WINDOW_DAYS,
  buildDashboard,
} from "@/lib/dashboard/dashboard-data";
import { fetchDashboardContracts } from "@/lib/dashboard/fetch-dashboard";
import { monthLabelOfKey, monthNameOfKey, toIsoDate, todayInAppTimeZone } from "@/lib/dates";

import { ContractsByUserCard } from "./_dashboard/contracts-by-user-card";
import { RecentContractsCard } from "./_dashboard/recent-contracts-card";
import { RevenueByPriceList } from "./_dashboard/revenue-by-price-list";
import { UpcomingEventsCard } from "./_dashboard/upcoming-events-card";

const percentFormatter = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/**
 * Sprint 8, task 7. Every figure on this page comes from ONE role-scoped
 * query (`fetchDashboardContracts` → `scopeToOwner`, spec §5) run through
 * pure aggregation (`buildDashboard`), which is what makes the task's "every
 * number matches what the corresponding report / list / calendar would show
 * for that same user" true by construction rather than by coincidence.
 *
 * `Contract.balance` is never read: Cobrado and Por cobrar derive from
 * SUM(payments.amount), exactly as `/reportes` does.
 *
 * No "Exportar" action in the header (resolved 2026-10-08): the dashboard
 * has no filter state of its own, so there is nothing meaningful for it to
 * export, and design-system §3 forbids a button that does not do its job.
 */
export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const isSuper = session.user.role === "super";
  const todayIso = toIsoDate(todayInAppTimeZone());
  const data = buildDashboard(await fetchDashboardContracts(session), todayIso, isSuper);

  const { revenue, outstanding, active, nearEventUnpaid: alert } = data;

  return (
    <>
      <PageHeader
        title="Inicio"
        subtitle={`${monthLabelOfKey(data.monthKey)} · Todo con un Solo Proveedor`}
        actions={
          <Button size="lg" render={<Link href="/contratos/nuevo" />}>
            Nuevo contrato
          </Button>
        }
      />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-7 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Ingresos del mes"
            value={<Money amount={revenue.current} />}
            icon={TrendingUp}
            // A delta needs a real historical anchor. `payments.paymentDate`
            // is one, so this card gets an arrow — but only when the previous
            // month actually collected something, since a percentage against
            // zero is meaningless. Otherwise it degrades to a plain caption.
            {...(revenue.deltaPercent === null
              ? {
                  context: `Sin ingresos en ${monthNameOfKey(revenue.previousMonthKey)}.`,
                }
              : {
                  trend: {
                    direction: revenue.deltaPercent >= 0 ? ("up" as const) : ("down" as const),
                    label: `${percentFormatter.format(revenue.deltaPercent)}% vs ${monthNameOfKey(revenue.previousMonthKey)}`,
                  },
                })}
          />
          {/* NO delta on this card (resolved 2026-10-08): outstanding balance
              has no historical snapshot to diff against — it could only be
              reconstructed approximately — so it shows its current value and
              a factual caption instead of an invented arrow. */}
          <KpiCard
            label="Por cobrar"
            value={<Money amount={outstanding.amount} />}
            icon={Wallet}
            context={
              outstanding.contractCount === 1
                ? "1 contrato con saldo pendiente"
                : `${outstanding.contractCount} contratos con saldo pendiente`
            }
          />
          <KpiCard
            label="Contratos activos"
            value={active.count}
            icon={FileText}
            context={
              active.preContractCount === 1
                ? "1 en precontrato"
                : `${active.preContractCount} en precontrato`
            }
          />
          <KpiCard
            label="Próximos eventos"
            value={data.upcomingCount}
            icon={CalendarDays}
            context={`en los próximos ${UPCOMING_WINDOW_DAYS} días`}
          />
        </div>

        {alert.count > 0 ? (
          <Alert
            tone="warning"
            icon={TriangleAlert}
            title={
              alert.count === 1
                ? `1 contrato confirmado con saldo pendiente a ${ALERT_WINDOW_DAYS} días del evento`
                : `${alert.count} contratos confirmados con saldo pendiente a ${ALERT_WINDOW_DAYS} días del evento`
            }
            // §2's content rule: cause AND suggested action, never a bare
            // status statement.
            description={
              <>
                Suman <Money amount={alert.amount} /> MXN por cobrar. Conviene enviar recordatorio
                antes de la fecha del evento.
              </>
            }
            // Plain `/contratos`, deliberately unfiltered: the list has no
            // "event within N days" filter, so any query string here would
            // land the operator on a count that disagrees with the banner.
            action={{ label: "Ver contratos", href: "/contratos" }}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <RecentContractsCard rows={data.recent} />
          <div className="flex flex-col gap-6">
            <UpcomingEventsCard rows={data.upcoming} totalCount={data.upcomingCount} />
            <RevenueByPriceList slices={data.revenueByPriceList} />
          </div>
        </div>

        {/* Absent, not hidden, for a `normal` session — `byCreator` is
            `null` unless the session is `super`. */}
        {data.byCreator ? <ContractsByUserCard rows={data.byCreator} /> : null}
      </div>
    </>
  );
}
