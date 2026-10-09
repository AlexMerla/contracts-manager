import type { Session } from "next-auth";

import { scopeToOwner } from "@/lib/authorization";
import { roundToCents, type ReportRow } from "@/lib/reports/report-row";

/**
 * The ONE query behind both the Reportes screen and its Excel export.
 *
 * Spec §5 is enforced here and nowhere else that matters: `scopeToOwner`
 * rewrites a `normal` session's `findMany` to `createdById = self` at the
 * data-access layer, so neither caller can forget to scope.
 *
 * `payments` is included rather than aggregated separately: the rows are
 * needed in memory anyway for the client-side filter chain, payments per
 * contract number in the units-to-dozens, and one round-trip keeps the
 * scoping implicit. Revisit if contract volume grows enough to need
 * server-side pagination.
 */
export async function fetchReportRows(session: Session): Promise<ReportRow[]> {
  const db = scopeToOwner(session);

  const contracts = await db.contract.findMany({
    orderBy: [{ eventDate: "desc" }, { folio: "desc" }],
    include: {
      createdBy: { select: { id: true, name: true } },
      priceList: { select: { id: true, name: true } },
      // `amount` only — "Cobrado" sums ALL historical payments regardless of
      // the filter window (resolved 2026-10-07), so `paymentDate` is unused.
      payments: { select: { amount: true } },
    },
  });

  return contracts.map((contract) => {
    // Decimal is not serializable across the RSC boundary -> Number().
    const total = Number(contract.total);
    const collected = roundToCents(
      contract.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
    );

    return {
      id: contract.id,
      folio: contract.folio,
      clientName: contract.clientName,
      eventType: contract.eventType,
      // `eventDate` is `@db.Date`, materialised as UTC midnight. Slicing the
      // ISO string gives the real calendar day — the same hazard
      // `contratos/page.tsx` guards against with `timeZone: "UTC"`.
      eventDateIso: contract.eventDate.toISOString().slice(0, 10),
      priceListId: contract.priceListId,
      priceListName: contract.priceList.name,
      createdById: contract.createdBy.id,
      createdByName: contract.createdBy.name,
      total,
      collected,
      balanceDue: roundToCents(Math.max(0, total - collected)),
    } satisfies ReportRow;
  });
}
