import type { EventType } from "@/generated/prisma/client";
import type { UserRole } from "@/lib/navigation";

/** "No filter applied" sentinel — the same literal `/contratos` uses. */
export const ALL_OPTION = "todos";

export interface ReportRow {
  id: string;
  folio: string;
  clientName: string;
  eventType: EventType;
  /** `YYYY-MM-DD` in UTC. Sortable and comparable as a plain string — see
   * `fetch-report-rows.ts` for why a `Date` would be a timezone hazard. */
  eventDateIso: string;
  priceListId: string;
  priceListName: string;
  createdById: string;
  createdByName: string;
  /** `contracts.total`, the creation-time snapshot. */
  total: number;
  /** SUM of EVERY payment on the contract — never windowed by the date
   * filter (resolved 2026-10-07), never `contracts.balance`. */
  collected: number;
  /** `max(0, total − collected)`. Derived live, never a stored column. */
  balanceDue: number;
}

export interface ReportFilters {
  /** "" | "YYYY-MM-DD". Both bounds inclusive; "" means unbounded. */
  desde: string;
  hasta: string;
  listaPrecios: string;
  usuario: string;
  tipoEvento: string;
  cliente: string;
}

export interface CreatorSummary {
  createdById: string;
  createdByName: string;
  contractCount: number;
  collected: number;
  balanceDue: number;
}

export const EMPTY_FILTERS: ReportFilters = {
  desde: "",
  hasta: "",
  listaPrecios: ALL_OPTION,
  usuario: ALL_OPTION,
  tipoEvento: ALL_OPTION,
  cliente: "",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A malformed date param is DROPPED, never thrown on: these values come
// straight off the query string, and a hand-edited URL must degrade to
// "no date filter", not to a 500.
function isoOrEmpty(value: string | undefined): string {
  return value !== undefined && ISO_DATE.test(value) ? value : "";
}

function optionOrAll(value: string | undefined): string {
  return value !== undefined && value !== "" && value !== ALL_OPTION ? value : ALL_OPTION;
}

/**
 * Builds the filter set from raw query params.
 *
 * SECURITY (spec §5, task 4's "Done when"): for any role other than `super`
 * the `usuario` param is DISCARDED outright — forced back to `ALL_OPTION` —
 * rather than validated. `scopeToOwner` has already restricted the row set
 * to that user's own contracts, so filtering by self is a no-op and
 * filtering by anyone else must be impossible to express. Both the page and
 * the export route call this, so there is no path that skips it.
 */
export function parseReportFilters(
  params: Record<string, string | undefined>,
  role: UserRole
): ReportFilters {
  return {
    desde: isoOrEmpty(params.desde),
    hasta: isoOrEmpty(params.hasta),
    listaPrecios: optionOrAll(params.listaPrecios),
    usuario: role === "super" ? optionOrAll(params.usuario) : ALL_OPTION,
    tipoEvento: optionOrAll(params.tipoEvento),
    cliente: (params.cliente ?? "").trim(),
  };
}

/** Feeds BOTH `router.replace` and the export `<a href>` — one string, so
 * the file can never describe a different filter set than the screen. */
export function reportFiltersToQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.desde) params.set("desde", filters.desde);
  if (filters.hasta) params.set("hasta", filters.hasta);
  if (filters.listaPrecios !== ALL_OPTION) params.set("listaPrecios", filters.listaPrecios);
  if (filters.usuario !== ALL_OPTION) params.set("usuario", filters.usuario);
  if (filters.tipoEvento !== ALL_OPTION) params.set("tipoEvento", filters.tipoEvento);
  if (filters.cliente.trim()) params.set("cliente", filters.cliente.trim());
  return params.toString();
}

export function filterReportRows(
  rows: readonly ReportRow[],
  filters: ReportFilters
): ReportRow[] {
  const needle = filters.cliente.trim().toLowerCase();
  return rows.filter((row) => {
    // Lexicographic on YYYY-MM-DD — correct, and timezone-free.
    if (filters.desde && row.eventDateIso < filters.desde) return false;
    if (filters.hasta && row.eventDateIso > filters.hasta) return false;
    if (filters.listaPrecios !== ALL_OPTION && row.priceListId !== filters.listaPrecios) {
      return false;
    }
    if (filters.usuario !== ALL_OPTION && row.createdById !== filters.usuario) return false;
    if (filters.tipoEvento !== ALL_OPTION && row.eventType !== filters.tipoEvento) return false;
    if (needle && !row.clientName.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/**
 * Mirrors the integer-cents rule documented in `src/lib/payments/status.ts`:
 * `Decimal(10,2)` values read back as JS floats accumulate drift when summed,
 * so every running total is snapped to the nearest cent.
 */
export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * "Resumen por usuario creador" — a JS reduce, deliberately NOT a Prisma
 * `groupBy`: Prisma cannot group `payment` rows by the related
 * `contract.createdById`, and the summary must reflect the client-side
 * FILTERED array, which the database never sees. Pass the filtered rows.
 */
export function summarizeByCreator(rows: readonly ReportRow[]): CreatorSummary[] {
  const byCreator = new Map<string, CreatorSummary>();

  for (const row of rows) {
    const entry = byCreator.get(row.createdById) ?? {
      createdById: row.createdById,
      createdByName: row.createdByName,
      contractCount: 0,
      collected: 0,
      balanceDue: 0,
    };
    entry.contractCount += 1;
    entry.collected += row.collected;
    entry.balanceDue += row.balanceDue;
    byCreator.set(row.createdById, entry);
  }

  return [...byCreator.values()]
    .map((entry) => ({
      ...entry,
      collected: roundToCents(entry.collected),
      balanceDue: roundToCents(entry.balanceDue),
    }))
    .sort((a, b) => a.createdByName.localeCompare(b.createdByName, "es-MX"));
}
