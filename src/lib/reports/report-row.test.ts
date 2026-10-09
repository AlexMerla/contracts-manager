import { describe, expect, it } from "vitest";

import {
  ALL_OPTION,
  filterReportRows,
  parseReportFilters,
  summarizeByCreator,
  type ReportRow,
} from "@/lib/reports/report-row";

const OTHER_USER = "11111111-1111-1111-1111-111111111111";

function row(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "c1", folio: "03001", clientName: "Mariana Robles", eventType: "wedding",
    eventDateIso: "2026-09-15", priceListId: "pl1", priceListName: "Bodas 2026",
    createdById: "u1", createdByName: "Gadiel H.",
    total: 48500, collected: 18000, balanceDue: 30500, isCancelled: false,
    ...overrides,
  };
}

describe("parseReportFilters", () => {
  // Task 4's "Done when", at the unit level.
  it("discards `usuario` for a normal role even when it is a valid uuid", () => {
    expect(parseReportFilters({ usuario: OTHER_USER }, "normal").usuario).toBe(ALL_OPTION);
  });

  it("keeps `usuario` for a super role", () => {
    expect(parseReportFilters({ usuario: OTHER_USER }, "super").usuario).toBe(OTHER_USER);
  });

  it("drops a malformed date instead of throwing", () => {
    expect(parseReportFilters({ desde: "15/09/2026" }, "super").desde).toBe("");
  });
});

describe("filterReportRows", () => {
  const rows = [
    row({ id: "a", eventDateIso: "2026-08-31" }),
    row({ id: "b", eventDateIso: "2026-09-01" }),
    row({ id: "c", eventDateIso: "2026-09-30" }),
    row({ id: "d", eventDateIso: "2026-10-01" }),
  ];

  it("treats both bounds as inclusive", () => {
    const got = filterReportRows(rows, {
      desde: "2026-09-01", hasta: "2026-09-30",
      listaPrecios: ALL_OPTION, usuario: ALL_OPTION, tipoEvento: ALL_OPTION, cliente: "",
    });
    expect(got.map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("summarizeByCreator", () => {
  it("counts and sums per creator in cent-exact pesos, ordered by name", () => {
    const got = summarizeByCreator([
      row({ createdById: "u1", createdByName: "Gadiel H.", collected: 0.1, balanceDue: 0.2 }),
      row({ createdById: "u1", createdByName: "Gadiel H.", collected: 0.2, balanceDue: 0.1 }),
      row({ createdById: "u2", createdByName: "Ana M.", collected: 30000, balanceDue: 49500 }),
    ]);
    expect(got.map((s) => s.createdByName)).toEqual(["Ana M.", "Gadiel H."]);
    // Would be 0.30000000000000004 without roundToCents.
    expect(got[1]).toMatchObject({ contractCount: 2, collected: 0.3, balanceDue: 0.3 });
  });
});
