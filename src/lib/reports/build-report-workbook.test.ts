import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildReportWorkbook } from "@/lib/reports/build-report-workbook";
import { EMPTY_FILTERS, type CreatorSummary, type ReportRow } from "@/lib/reports/report-row";

async function readBack(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

const ROWS: ReportRow[] = [
  {
    id: "c1",
    folio: "03001",
    clientName: "Mariana Robles",
    eventType: "wedding",
    eventDateIso: "2026-09-15",
    priceListId: "pl1",
    priceListName: "Bodas 2026",
    createdById: "u1",
    createdByName: "Gadiel H.",
    total: 48500,
    collected: 18000,
    balanceDue: 30500,
    isCancelled: false,
  },
  {
    id: "c2",
    folio: "03002",
    clientName: "Familia Ontiveros",
    eventType: "other",
    eventDateIso: "2026-09-20",
    priceListId: "pl2",
    priceListName: "General",
    createdById: "u2",
    createdByName: "Lucía M.",
    total: 32900,
    collected: 32900,
    balanceDue: 0,
    // A cancelled contract is STILL exported, with no marker column — the Q6
    // indicator is on-screen only. This fixture is what makes that explicit.
    isCancelled: true,
  },
];

const SUMMARY: CreatorSummary[] = [
  { createdById: "u1", createdByName: "Gadiel H.", contractCount: 1, collected: 18000, balanceDue: 30500 },
  { createdById: "u2", createdByName: "Lucía M.", contractCount: 1, collected: 32900, balanceDue: 0 },
];

describe("buildReportWorkbook", () => {
  it("writes one data row per input row, in order, with no banner above the header", async () => {
    const workbook = await readBack(
      await buildReportWorkbook({ rows: ROWS, summary: null, filters: EMPTY_FILTERS, generatedAt: new Date(0) })
    );
    const sheet = workbook.getWorksheet("Contratos")!;
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "Folio",
      "Cliente",
      "Lista de precios",
      "Creó",
      "Total",
      "Cobrado",
      "Fecha",
    ]);
    expect(sheet.rowCount).toBe(ROWS.length + 1);
    // exceljs does not reliably restore columns[].key lookups after a
    // round-trip through xlsx.load() in the installed version — fall back
    // to 1-based column indexes, as the design's own fallback note allows.
    // Column order: A=folio B=clientName C=priceListName D=createdByName
    // E=total F=collected G=eventDate.
    expect(sheet.getRow(2).getCell(1).value).toBe(ROWS[0].folio);
    expect(sheet.getRow(2).getCell(5).value).toBe(ROWS[0].total); // a NUMBER, not a string
    const eventDateCell = sheet.getRow(2).getCell(7).value;
    expect(eventDateCell).toBeInstanceOf(Date);
    expect((eventDateCell as Date).toISOString().slice(0, 10)).toBe(ROWS[0].eventDateIso);
  });

  it("omits the summary sheet entirely when summary is null (normal user)", async () => {
    const workbook = await readBack(
      await buildReportWorkbook({ rows: [], summary: null, filters: EMPTY_FILTERS, generatedAt: new Date(0) })
    );
    expect(workbook.getWorksheet("Resumen por usuario")).toBeUndefined();
  });

  it("includes the summary sheet for a super user", async () => {
    const workbook = await readBack(
      await buildReportWorkbook({ rows: ROWS, summary: SUMMARY, filters: EMPTY_FILTERS, generatedAt: new Date(0) })
    );
    const sheet = workbook.getWorksheet("Resumen por usuario")!;
    expect(sheet.getRow(1).values).toEqual([undefined, "Usuario", "Contratos", "Cobrado", "Saldo"]);
    expect(sheet.rowCount).toBe(SUMMARY.length + 1);
  });
});
