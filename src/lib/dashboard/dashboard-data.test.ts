import { describe, expect, it } from "vitest";

import {
  ALERT_WINDOW_DAYS,
  UPCOMING_WINDOW_DAYS,
  activeContracts,
  buildDashboard,
  monthlyRevenue,
  nearEventUnpaid,
  outstandingTotal,
  recentContracts,
  revenueByPriceList,
  upcomingEvents,
  type DashboardContract,
} from "@/lib/dashboard/dashboard-data";
import { summarizeByCreator } from "@/lib/reports/report-row";

const TODAY = "2026-09-04";

function contract(overrides: Partial<DashboardContract> = {}): DashboardContract {
  const total = overrides.total ?? 48500;
  const collected =
    overrides.collected ??
    (overrides.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  return {
    id: "c1",
    folio: "03001",
    clientName: "Mariana Robles",
    eventType: "wedding",
    eventDateIso: "2026-12-12",
    contractStatus: "confirmed",
    paymentStatus: "partial",
    total,
    collected,
    balanceDue: Math.max(0, total - collected),
    priceListId: "pl1",
    priceListName: "Bodas 2026",
    createdById: "u1",
    createdByName: "Gadiel H.",
    createdAtIso: "2026-09-01T10:00:00.000Z",
    payments: [],
    ...overrides,
  };
}

describe("monthlyRevenue", () => {
  it("sums payments by paymentDate month, not by contract", () => {
    const rows = [
      contract({
        id: "a",
        payments: [
          { amount: 10000, paymentDateIso: "2026-09-01" },
          { amount: 5000, paymentDateIso: "2026-08-20" },
        ],
      }),
      contract({ id: "b", payments: [{ amount: 2500, paymentDateIso: "2026-09-30" }] }),
      // July must not leak into either bucket.
      contract({ id: "c", payments: [{ amount: 99999, paymentDateIso: "2026-07-15" }] }),
    ];
    const revenue = monthlyRevenue(rows, "2026-09");
    expect(revenue.current).toBe(12500);
    expect(revenue.previous).toBe(5000);
    expect(revenue.previousMonthKey).toBe("2026-08");
    expect(revenue.deltaPercent).toBe(150);
  });

  it("reports a null delta instead of dividing by a zero previous month", () => {
    const revenue = monthlyRevenue(
      [contract({ payments: [{ amount: 100, paymentDateIso: "2026-09-02" }] })],
      "2026-09"
    );
    expect(revenue.previous).toBe(0);
    expect(revenue.deltaPercent).toBeNull();
  });

  it("rounds each bucket to the cent", () => {
    const revenue = monthlyRevenue(
      [
        contract({
          payments: [
            { amount: 0.1, paymentDateIso: "2026-09-02" },
            { amount: 0.2, paymentDateIso: "2026-09-03" },
          ],
        }),
      ],
      "2026-09"
    );
    // 0.30000000000000004 without roundToCents.
    expect(revenue.current).toBe(0.3);
  });
});

describe("outstandingTotal", () => {
  it("excludes cancelled contracts and fully-paid ones", () => {
    const rows = [
      contract({ id: "a", total: 100, collected: 40, balanceDue: 60 }),
      contract({ id: "b", total: 100, collected: 100, balanceDue: 0 }),
      contract({
        id: "c",
        contractStatus: "cancelled",
        total: 100,
        collected: 0,
        balanceDue: 100,
      }),
      contract({ id: "d", contractStatus: "completed", total: 100, collected: 90, balanceDue: 10 }),
    ];
    expect(outstandingTotal(rows)).toEqual({ amount: 70, contractCount: 2 });
  });
});

describe("activeContracts", () => {
  it("counts only pre_contract and confirmed, and breaks out precontratos", () => {
    const rows = [
      contract({ id: "a", contractStatus: "pre_contract" }),
      contract({ id: "b", contractStatus: "pre_contract" }),
      contract({ id: "c", contractStatus: "confirmed" }),
      contract({ id: "d", contractStatus: "completed" }),
      contract({ id: "e", contractStatus: "cancelled" }),
    ];
    expect(activeContracts(rows)).toEqual({ count: 3, preContractCount: 2 });
  });
});

describe("upcomingEvents", () => {
  const rows = [
    contract({ id: "yesterday", eventDateIso: "2026-09-03" }),
    contract({ id: "today", eventDateIso: TODAY }),
    contract({ id: "last-day", eventDateIso: "2026-10-04" }),
    contract({ id: "just-after", eventDateIso: "2026-10-05" }),
    contract({ id: "cancelled", eventDateIso: "2026-09-10", contractStatus: "cancelled" }),
  ];

  it("includes today, includes the last day of the window, and drops cancelled", () => {
    expect(upcomingEvents(rows, TODAY, UPCOMING_WINDOW_DAYS).map((row) => row.id)).toEqual([
      "today",
      "last-day",
    ]);
  });

  it("sorts ascending by event date", () => {
    const unsorted = [
      contract({ id: "late", eventDateIso: "2026-09-20" }),
      contract({ id: "early", eventDateIso: "2026-09-06" }),
    ];
    expect(upcomingEvents(unsorted, TODAY).map((row) => row.id)).toEqual(["early", "late"]);
  });
});

describe("nearEventUnpaid", () => {
  it("requires confirmed AND unpaid AND inside the window — never any two", () => {
    const rows = [
      // The one real hit.
      contract({ id: "hit", eventDateIso: "2026-09-10", balanceDue: 20000 }),
      // Unpaid and near, but only a pre-contract.
      contract({ id: "pre", contractStatus: "pre_contract", eventDateIso: "2026-09-10" }),
      // Confirmed and near, but settled.
      contract({ id: "paid", paymentStatus: "paid_in_full", eventDateIso: "2026-09-10" }),
      // Confirmed and unpaid, but one day past the 15-day window.
      contract({ id: "far", eventDateIso: "2026-09-20" }),
      // Confirmed and unpaid, but the event already happened.
      contract({ id: "past", eventDateIso: "2026-09-03" }),
    ];
    expect(nearEventUnpaid(rows, TODAY, ALERT_WINDOW_DAYS)).toEqual({ count: 1, amount: 20000 });
  });

  it("includes the last day of the window", () => {
    const rows = [contract({ eventDateIso: "2026-09-19", balanceDue: 500 })];
    expect(nearEventUnpaid(rows, TODAY).count).toBe(1);
  });
});

describe("recentContracts", () => {
  it("returns the newest by createdAt, capped at the limit", () => {
    const rows = [
      contract({ id: "old", createdAtIso: "2026-08-01T00:00:00.000Z" }),
      contract({ id: "newest", createdAtIso: "2026-09-03T00:00:00.000Z" }),
      contract({ id: "mid", createdAtIso: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(recentContracts(rows, 2).map((row) => row.id)).toEqual(["newest", "mid"]);
  });
});

describe("revenueByPriceList", () => {
  it("ranks by collected, scales bars against the largest, and cycles chart tokens", () => {
    const rows = [
      contract({ id: "a", priceListId: "pl1", priceListName: "Bodas 2026", collected: 80000 }),
      contract({ id: "b", priceListId: "pl1", priceListName: "Bodas 2026", collected: 6400 }),
      contract({ id: "c", priceListId: "pl2", priceListName: "General", collected: 43200 }),
      // Zero-revenue lists are dropped, not drawn as an empty bar.
      contract({ id: "d", priceListId: "pl3", priceListName: "Corporativo", collected: 0 }),
    ];
    const slices = revenueByPriceList(rows);
    expect(slices.map((slice) => [slice.priceListName, slice.collected])).toEqual([
      ["Bodas 2026", 86400],
      ["General", 43200],
    ]);
    expect(slices[0].percentOfMax).toBe(100);
    expect(slices[1].percentOfMax).toBe(50);
    expect(slices.map((slice) => slice.chartToken)).toEqual(["chart-1", "chart-2"]);
  });

  it("returns an empty list when nothing has been collected", () => {
    expect(revenueByPriceList([contract({ collected: 0 })])).toEqual([]);
  });
});

describe("buildDashboard", () => {
  const rows = [
    contract({
      id: "a",
      createdById: "u1",
      createdByName: "Gadiel H.",
      total: 100,
      collected: 40,
      balanceDue: 60,
      payments: [{ amount: 40, paymentDateIso: "2026-09-02" }],
    }),
    contract({
      id: "b",
      createdById: "u2",
      createdByName: "Ana M.",
      total: 200,
      collected: 200,
      balanceDue: 0,
      paymentStatus: "paid_in_full",
      payments: [{ amount: 200, paymentDateIso: "2026-08-15" }],
    }),
  ];

  it("omits the per-user block entirely for a normal session", () => {
    expect(buildDashboard(rows, TODAY, false).byCreator).toBeNull();
  });

  it("uses reports' own summarizeByCreator for the super-only block", () => {
    // Parity with /reportes is structural, not a copy: the dashboard rows go
    // through the very same function the Reportes screen calls.
    expect(buildDashboard(rows, TODAY, true).byCreator).toEqual(summarizeByCreator(rows));
  });

  it("derives every figure from the rows it is given", () => {
    const data = buildDashboard(rows, TODAY, true);
    expect(data.monthKey).toBe("2026-09");
    expect(data.revenue.current).toBe(40);
    expect(data.revenue.previous).toBe(200);
    expect(data.outstanding).toEqual({ amount: 60, contractCount: 1 });
    expect(data.active).toEqual({ count: 2, preContractCount: 0 });
    // Both events are 2026-12-12 — outside the 30-day window.
    expect(data.upcomingCount).toBe(0);
    expect(data.upcoming).toEqual([]);
    expect(data.nearEventUnpaid).toEqual({ count: 0, amount: 0 });
    expect(data.recent.map((row) => row.id)).toEqual(["a", "b"]);
  });
});
