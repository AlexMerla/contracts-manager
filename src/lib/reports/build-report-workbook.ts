import ExcelJS from "exceljs";

import type { CreatorSummary, ReportFilters, ReportRow } from "@/lib/reports/report-row";

const MONEY_FORMAT = '"$"#,##0.00';
/** Text format: keeps the folio's `03142` zero padding and suppresses
 * Excel's "number stored as text" warning triangle. */
const TEXT_FORMAT = "@";
/** `dd/mm/yyyy` per design-system §3's date convention. */
const DATE_FORMAT = "dd/mm/yyyy";

export interface BuildReportWorkbookArgs {
  rows: readonly ReportRow[];
  /** `null` for a `normal` user — the summary block is `super`-only on
   * screen, so the sheet must be absent from their file too. */
  summary: readonly CreatorSummary[] | null;
  filters: ReportFilters;
  generatedAt: Date;
}

function describePeriod(filters: ReportFilters): string {
  if (!filters.desde && !filters.hasta) return "Todas las fechas";
  return `Del ${filters.desde || "inicio"} al ${filters.hasta || "hoy"}`;
}

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
}

/**
 * Task 5's "Done when": the sheet's data rows must match the on-screen
 * filtered rows EXACTLY. Two rules keep that mechanically checkable:
 *  1. the column set is the on-screen table's, in the same order (Folio,
 *     Cliente, Lista de precios, Creó, Total, Cobrado, Fecha — the Fecha
 *     column is a later amendment, added after "Cobrado", per
 *     `sdd/sprint-08-reports/design-amendment-fecha-column`, which
 *     supersedes the original "exactly 6 columns" design decision);
 *  2. row 1 is the header row — nothing above it. The filter window and
 *     generation time live in the workbook's document properties and in the
 *     filename, NOT in a banner row that would offset every data row.
 * Values are written as real numbers/dates with real formats, never as
 * pre-formatted strings, so the file stays sortable and pivotable.
 */
export async function buildReportWorkbook({
  rows,
  summary,
  filters,
  generatedAt,
}: BuildReportWorkbookArgs): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Contratos TSP";
  workbook.created = generatedAt;
  workbook.title = "Reporte de contratos";
  workbook.description = describePeriod(filters);

  const contracts = workbook.addWorksheet("Contratos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  contracts.columns = [
    { header: "Folio", key: "folio", width: 12, style: { numFmt: TEXT_FORMAT } },
    { header: "Cliente", key: "clientName", width: 32 },
    { header: "Lista de precios", key: "priceListName", width: 22 },
    { header: "Creó", key: "createdByName", width: 22 },
    { header: "Total", key: "total", width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: "Cobrado", key: "collected", width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: "Fecha", key: "eventDate", width: 14, style: { numFmt: DATE_FORMAT } },
  ];
  styleHeaderRow(contracts);

  for (const row of rows) {
    contracts.addRow({
      folio: row.folio,
      clientName: row.clientName,
      priceListName: row.priceListName,
      createdByName: row.createdByName,
      total: row.total,
      collected: row.collected,
      // A real Date value, not a pre-formatted string — mirrors the
      // money/count columns' "never a string" rule.
      eventDate: new Date(`${row.eventDateIso}T00:00:00Z`),
    });
  }
  contracts.autoFilter = "A1:G1";

  if (summary) {
    const sheet = workbook.addWorksheet("Resumen por usuario", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = [
      { header: "Usuario", key: "createdByName", width: 28 },
      { header: "Contratos", key: "contractCount", width: 12, style: { numFmt: "0" } },
      { header: "Cobrado", key: "collected", width: 16, style: { numFmt: MONEY_FORMAT } },
      { header: "Saldo", key: "balanceDue", width: 16, style: { numFmt: MONEY_FORMAT } },
    ];
    styleHeaderRow(sheet);

    for (const entry of summary) {
      sheet.addRow({
        createdByName: entry.createdByName,
        contractCount: entry.contractCount,
        collected: entry.collected,
        balanceDue: entry.balanceDue,
      });
    }
    sheet.autoFilter = "A1:D1";
  }

  // `writeBuffer()` resolves to `ExcelJS.Buffer`, declared as an ArrayBuffer.
  return workbook.xlsx.writeBuffer();
}
