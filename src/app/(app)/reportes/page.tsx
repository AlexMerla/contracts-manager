import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { fetchReportRows } from "@/lib/reports/fetch-report-rows";
import { parseReportFilters } from "@/lib/reports/report-row";

import { ReportsView } from "./reports-view";

interface ReportesPageProps {
  // Same `searchParams` pattern as contratos/page.tsx — read only to seed
  // the client view's initial state; filtering itself is client-side.
  searchParams: Promise<Record<string, string | undefined>>;
}

// Spec §9. Reachable by BOTH roles (`role: "normal"` in NAV_ITEMS, so
// `/reportes` is deliberately not in `SUPER_ONLY_PREFIXES`); the per-user
// summary block inside is the `super`-only part.
export default async function ReportesPage({ searchParams }: ReportesPageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const isSuper = session.user.role === "super";
  const rows = await fetchReportRows(session);
  const initialFilters = parseReportFilters(await searchParams, session.user.role);

  // Derived from the ALREADY-SCOPED rows, so a `normal` user's user filter
  // can only ever offer themself — belt to `parseReportFilters`' braces.
  const userOptions = [...new Map(rows.map((row) => [row.createdById, row.createdByName]))]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));

  const priceListOptions = [...new Map(rows.map((row) => [row.priceListId, row.priceListName]))]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));

  return (
    <ReportsView
      rows={rows}
      userOptions={userOptions}
      priceListOptions={priceListOptions}
      showSummary={isSuper}
      initialFilters={initialFilters}
    />
  );
}
