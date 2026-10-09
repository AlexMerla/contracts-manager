import { auth } from "@/lib/auth";
import { buildReportWorkbook } from "@/lib/reports/build-report-workbook";
import { fetchReportRows } from "@/lib/reports/fetch-report-rows";
import {
  filterReportRows,
  parseReportFilters,
  summarizeByCreator,
  type ReportFilters,
} from "@/lib/reports/report-row";

// exceljs is CJS and reaches for Node's stream/zlib — it must run on the
// Node runtime, and it is also listed in `serverExternalPackages`
// (next.config.ts) so the bundler leaves it alone, exactly as
// @napi-rs/canvas already is.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ASCII-only by construction: a `Content-Disposition` filename with accents
// would need RFC 5987 `filename*` encoding. Sidestepped entirely.
function buildFilename(filters: ReportFilters): string {
  const period =
    filters.desde || filters.hasta
      ? `${filters.desde || "inicio"}_${filters.hasta || "hoy"}`
      : "todas-las-fechas";
  return `Reporte-contratos-${period}.xlsx`;
}

/**
 * Task 5. The rows are RE-DERIVED here from the query string through the
 * very same scoped query and the very same pure filter function the screen
 * uses — never trusted from the client. That is both the parity guarantee
 * and the security boundary:
 *   1. `scopeToOwner` (inside `fetchReportRows`) restricts a `normal`
 *      session to its own contracts at the data-access layer;
 *   2. `parseReportFilters` discards a non-`super` `usuario` param outright,
 *      so a crafted `?usuario=<other-uuid>` is inert before (1) even runs.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return new Response("No autenticado.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { searchParams } = new URL(request.url);
  const filters = parseReportFilters(
    Object.fromEntries(searchParams.entries()),
    session.user.role
  );

  const rows = filterReportRows(await fetchReportRows(session), filters);
  const isSuper = session.user.role === "super";

  let workbook: ArrayBuffer;
  try {
    workbook = await buildReportWorkbook({
      rows,
      summary: isSuper ? summarizeByCreator(rows) : null,
      filters,
      generatedAt: new Date(),
    });
  } catch (error: unknown) {
    console.error("Failed to build the reports workbook:", error);
    return new Response("No se pudo generar el archivo de Excel.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Length": String(workbook.byteLength),
      "Content-Disposition": `attachment; filename="${buildFilename(filters)}"`,
      // Per-session, per-filter data — unlike the public viewer's image,
      // this must never sit in any cache.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
