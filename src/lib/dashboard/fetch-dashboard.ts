import type { Session } from "next-auth";

import { scopeToOwner } from "@/lib/authorization";
import { toIsoDate } from "@/lib/dates";
import { roundToCents } from "@/lib/reports/report-row";

import type { DashboardContract } from "./dashboard-data";

/**
 * The ONE query behind the whole dashboard.
 *
 * Spec §5 is enforced here and nowhere else that matters: `scopeToOwner`
 * rewrites a `normal` session's `findMany` to `createdById = self` at the
 * data-access layer, and the nested `payments` come back through that same
 * scoped parent — so there is no aggregate anywhere on the page, not even an
 * indirect one, that can include another user's contract.
 *
 * Payments are included rather than aggregated in SQL for the same reason
 * `fetchReportRows` does it: the dashboard needs per-contract `collected`
 * (for Por cobrar, Próximos eventos and the price-list bars) AND
 * per-month sums (for Ingresos del mes) out of the same rows, and Prisma
 * cannot group `payment` by the related `contract.priceListId` anyway. One
 * round-trip; revisit if contract volume ever needs server-side paging.
 */
export async function fetchDashboardContracts(session: Session): Promise<DashboardContract[]> {
  const db = scopeToOwner(session);

  const contracts = await db.contract.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      folio: true,
      clientName: true,
      eventType: true,
      eventDate: true,
      contractStatus: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
      priceListId: true,
      createdBy: { select: { id: true, name: true } },
      priceList: { select: { name: true } },
      payments: { select: { amount: true, paymentDate: true } },
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
      // `eventDate`/`paymentDate` are `@db.Date`, materialised as UTC
      // midnight — slicing the ISO string gives the real calendar day.
      eventDateIso: toIsoDate(contract.eventDate),
      contractStatus: contract.contractStatus,
      paymentStatus: contract.paymentStatus,
      total,
      collected,
      balanceDue: roundToCents(Math.max(0, total - collected)),
      priceListId: contract.priceListId,
      priceListName: contract.priceList.name,
      createdById: contract.createdBy.id,
      createdByName: contract.createdBy.name,
      createdAtIso: contract.createdAt.toISOString(),
      payments: contract.payments.map((payment) => ({
        amount: Number(payment.amount),
        paymentDateIso: toIsoDate(payment.paymentDate),
      })),
    } satisfies DashboardContract;
  });
}
