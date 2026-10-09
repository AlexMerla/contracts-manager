import type { ContractStatus, EventType, PaymentStatus } from "@/generated/prisma/client";
import { addDaysIso, addMonthsToKey, monthKeyOf } from "@/lib/dates";
import type { ChartToken } from "@/lib/event-type";
import { roundToCents, summarizeByCreator, type CreatorSummary } from "@/lib/reports/report-row";

/**
 * Pure aggregation behind `/` (Sprint 8, task 7). No Prisma, no React —
 * every indicator is a function of one already-scoped array, which is what
 * makes task 7's "every number matches what the corresponding report / list /
 * calendar would show" mechanically checkable in unit tests rather than by
 * eyeballing the screen.
 *
 * Role scoping is NOT done here. It happens one layer up, in
 * `fetch-dashboard.ts`, through `scopeToOwner` at the data-access layer
 * (spec §5). This module never sees a row it is not allowed to count.
 */

/** Mockup-derived: "3 contratos confirmados con saldo pendiente a 15 días
 *  del evento". A named constant, not a literal, because the alert copy
 *  interpolates it. */
export const ALERT_WINDOW_DAYS = 15;

/** Mockup-derived: "en los próximos 30 días" under the PRÓXIMOS EVENTOS KPI. */
export const UPCOMING_WINDOW_DAYS = 30;

export const RECENT_CONTRACTS_LIMIT = 5;
export const UPCOMING_EVENTS_LIMIT = 5;

/** "Activo" = still in flight. `completed` and `cancelled` are terminal. */
export const ACTIVE_CONTRACT_STATUSES: readonly ContractStatus[] = ["pre_contract", "confirmed"];

export interface DashboardPayment {
  /** `payments.amount`, already `Number()`-ed out of `Decimal`. */
  readonly amount: number;
  /** `YYYY-MM-DD` in UTC — `payments.paymentDate` is `@db.Date`. */
  readonly paymentDateIso: string;
}

/**
 * One contract, flattened and serialisable across the RSC boundary. The
 * field names deliberately match `ReportRow`'s where they overlap
 * (`collected`, `balanceDue`, `eventDateIso`, `createdByName`) so the two
 * modules compute the same quantity under the same name — and so this type
 * structurally satisfies `CreatorSummarizable` and can be fed straight to
 * reports' `summarizeByCreator`.
 */
export interface DashboardContract {
  readonly id: string;
  readonly folio: string;
  readonly clientName: string;
  readonly eventType: EventType;
  readonly eventDateIso: string;
  readonly contractStatus: ContractStatus;
  readonly paymentStatus: PaymentStatus;
  /** `contracts.total`, the creation-time snapshot (spec §6.5). */
  readonly total: number;
  /** SUM of every payment on the contract. NEVER `contracts.balance`. */
  readonly collected: number;
  /** `max(0, total − collected)`. Derived live, never a stored column. */
  readonly balanceDue: number;
  readonly priceListId: string;
  readonly priceListName: string;
  readonly createdById: string;
  readonly createdByName: string;
  /** `contracts.createdAt` as an ISO instant — ordering key for "recientes". */
  readonly createdAtIso: string;
  readonly payments: readonly DashboardPayment[];
}

export interface MonthlyRevenue {
  /** Cash collected in the current month: SUM(payments.amount) where
   *  `paymentDate` falls in it. NOT reports' all-time per-contract
   *  `collected` (resolved open decision #2). */
  readonly current: number;
  readonly previous: number;
  /** `null` when the previous month collected nothing — a percentage against
   *  zero is either infinity or a lie, so the card falls back to a plain
   *  caption instead of a delta arrow. */
  readonly deltaPercent: number | null;
  readonly previousMonthKey: string;
}

export interface OutstandingTotal {
  readonly amount: number;
  readonly contractCount: number;
}

export interface ActiveContracts {
  readonly count: number;
  readonly preContractCount: number;
}

export interface NearEventUnpaid {
  readonly count: number;
  readonly amount: number;
}

export interface RevenueSlice {
  readonly priceListId: string;
  readonly priceListName: string;
  readonly collected: number;
  /** 0-100, relative to the LARGEST slice — this is a ranked bar chart, so
   *  the top bar fills the track and everything else is read against it. */
  readonly percentOfMax: number;
  readonly chartToken: ChartToken;
}

export interface DashboardData {
  readonly monthKey: string;
  readonly revenue: MonthlyRevenue;
  readonly outstanding: OutstandingTotal;
  readonly active: ActiveContracts;
  readonly upcomingCount: number;
  readonly nearEventUnpaid: NearEventUnpaid;
  readonly recent: readonly DashboardContract[];
  readonly upcoming: readonly DashboardContract[];
  readonly revenueByPriceList: readonly RevenueSlice[];
  /** `null` for a `normal` session — the block is ABSENT, not hidden. */
  readonly byCreator: readonly CreatorSummary[] | null;
}

/** §1.1's fixed categorical order. Price lists are user-created, so unlike
 *  `EVENT_TYPE_CHART_TOKEN` there can be no permanent token-per-entity map;
 *  the ranked bar chart assigns by position and cycles past eight. */
const CHART_TOKENS: readonly ChartToken[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
  "chart-8",
];

export function monthlyRevenue(
  contracts: readonly DashboardContract[],
  monthKey: string
): MonthlyRevenue {
  const previousMonthKey = addMonthsToKey(monthKey, -1);
  let current = 0;
  let previous = 0;

  for (const contract of contracts) {
    for (const payment of contract.payments) {
      const key = monthKeyOf(payment.paymentDateIso);
      if (key === monthKey) current += payment.amount;
      else if (key === previousMonthKey) previous += payment.amount;
    }
  }

  current = roundToCents(current);
  previous = roundToCents(previous);

  return {
    current,
    previous,
    deltaPercent: previous > 0 ? ((current - previous) / previous) * 100 : null,
    previousMonthKey,
  };
}

/**
 * "Por cobrar" — money still owed. `cancelled` contracts are excluded: their
 * balance is not collectable, and showing it would overstate the figure the
 * operator is meant to chase. Everything else (including `completed`, which
 * can still carry a balance) counts.
 */
export function outstandingTotal(contracts: readonly DashboardContract[]): OutstandingTotal {
  let amount = 0;
  let contractCount = 0;

  for (const contract of contracts) {
    if (contract.contractStatus === "cancelled" || contract.balanceDue <= 0) continue;
    amount += contract.balanceDue;
    contractCount += 1;
  }

  return { amount: roundToCents(amount), contractCount };
}

export function activeContracts(contracts: readonly DashboardContract[]): ActiveContracts {
  let count = 0;
  let preContractCount = 0;

  for (const contract of contracts) {
    if (!ACTIVE_CONTRACT_STATUSES.includes(contract.contractStatus)) continue;
    count += 1;
    if (contract.contractStatus === "pre_contract") preContractCount += 1;
  }

  return { count, preContractCount };
}

/**
 * Events from today (inclusive) through `windowDays` later (inclusive),
 * cheapest-correct: both bounds are `YYYY-MM-DD` strings, so the comparison
 * is lexicographic and no `Date` — and therefore no timezone — is involved.
 * `cancelled` contracts are not upcoming events.
 */
export function upcomingEvents(
  contracts: readonly DashboardContract[],
  todayIso: string,
  windowDays: number = UPCOMING_WINDOW_DAYS
): DashboardContract[] {
  const until = addDaysIso(todayIso, windowDays);
  return contracts
    .filter(
      (contract) =>
        contract.contractStatus !== "cancelled" &&
        contract.eventDateIso >= todayIso &&
        contract.eventDateIso <= until
    )
    .sort((a, b) => a.eventDateIso.localeCompare(b.eventDateIso) || a.folio.localeCompare(b.folio));
}

/**
 * The alert's trigger set: CONFIRMED (a pre-contract has not committed yet,
 * a cancelled one is moot) AND not fully paid AND the event lands inside the
 * next `ALERT_WINDOW_DAYS`. All three conditions, never any two.
 */
export function nearEventUnpaid(
  contracts: readonly DashboardContract[],
  todayIso: string,
  windowDays: number = ALERT_WINDOW_DAYS
): NearEventUnpaid {
  const until = addDaysIso(todayIso, windowDays);
  let count = 0;
  let amount = 0;

  for (const contract of contracts) {
    if (contract.contractStatus !== "confirmed") continue;
    if (contract.paymentStatus === "paid_in_full") continue;
    if (contract.eventDateIso < todayIso || contract.eventDateIso > until) continue;
    count += 1;
    amount += contract.balanceDue;
  }

  return { count, amount: roundToCents(amount) };
}

/** Newest first by `createdAt` — "recientes" means recently CREATED, which
 *  is the order `/contratos` itself lists in, so the top of this table is
 *  always the top of that list. */
export function recentContracts(
  contracts: readonly DashboardContract[],
  limit: number = RECENT_CONTRACTS_LIMIT
): DashboardContract[] {
  return [...contracts]
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso) || b.folio.localeCompare(a.folio))
    .slice(0, limit);
}

/**
 * §4's "chart of revenue by price list". "Ingresos" means cash actually
 * received — SUM(payments.amount), all-time — so this block is exactly
 * `/reportes`' Cobrado column grouped by Lista de precios with no filters
 * applied. Price lists that have collected nothing are dropped rather than
 * drawn as a zero-width bar.
 */
export function revenueByPriceList(contracts: readonly DashboardContract[]): RevenueSlice[] {
  const byList = new Map<string, { priceListName: string; collected: number }>();

  for (const contract of contracts) {
    const entry = byList.get(contract.priceListId) ?? {
      priceListName: contract.priceListName,
      collected: 0,
    };
    entry.collected += contract.collected;
    byList.set(contract.priceListId, entry);
  }

  const ranked = [...byList.entries()]
    .map(([priceListId, entry]) => ({
      priceListId,
      priceListName: entry.priceListName,
      collected: roundToCents(entry.collected),
    }))
    .filter((slice) => slice.collected > 0)
    .sort(
      (a, b) => b.collected - a.collected || a.priceListName.localeCompare(b.priceListName, "es-MX")
    );

  const max = ranked[0]?.collected ?? 0;

  return ranked.map((slice, index) => ({
    ...slice,
    percentOfMax: max > 0 ? (slice.collected / max) * 100 : 0,
    chartToken: CHART_TOKENS[index % CHART_TOKENS.length],
  }));
}

/**
 * The whole screen from one array. `todayIso` and `monthKey` are passed in
 * rather than read from the clock so every test is deterministic and the
 * server resolves "today" exactly once (in Mexico City time, via
 * `todayInAppTimeZone`).
 */
export function buildDashboard(
  contracts: readonly DashboardContract[],
  todayIso: string,
  isSuper: boolean
): DashboardData {
  return {
    monthKey: monthKeyOf(todayIso),
    revenue: monthlyRevenue(contracts, monthKeyOf(todayIso)),
    outstanding: outstandingTotal(contracts),
    active: activeContracts(contracts),
    upcomingCount: upcomingEvents(contracts, todayIso).length,
    nearEventUnpaid: nearEventUnpaid(contracts, todayIso),
    recent: recentContracts(contracts),
    upcoming: upcomingEvents(contracts, todayIso).slice(0, UPCOMING_EVENTS_LIMIT),
    revenueByPriceList: revenueByPriceList(contracts),
    // Reports' own implementation, not a copy — `DashboardContract`
    // structurally satisfies `CreatorSummarizable`.
    byCreator: isSuper ? summarizeByCreator(contracts) : null,
  };
}
