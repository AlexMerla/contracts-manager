import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { scopeToOwner } from "@/lib/authorization";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

import { ContractsListView, type ContractRow } from "./contracts-list-view";

// `eventDate` is `@db.Date`, materialised as UTC midnight — timeZone: "UTC"
// avoids the local-timezone shift that would otherwise print the day
// before the real one on a negative-UTC-offset host.
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeZone: "UTC" });

interface ContratosPageProps {
  // Same `searchParams` pattern as catalogo/page.tsx. Read only to seed the
  // client view's initial state — filtering itself is client-side.
  searchParams: Promise<{
    estado?: string;
    q?: string;
    tipoEvento?: string;
    listaPrecios?: string;
    estatusPago?: string;
    pendientes?: string;
  }>;
}

// Spec §5: `normal` sees only contracts where `createdById = self`, `super`
// sees all. Enforced at the data-access layer via `scopeToOwner` (not just
// by hiding rows in the UI) — sprint-04 task 8's "a normal user's list never
// includes another user's contracts". The tabs/filters below operate on the
// array this query already scoped, so they add no authorization surface.
export default async function ContratosPage({ searchParams }: ContratosPageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const db = scopeToOwner(session);
  const contracts = await db.contract.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      priceList: { select: { name: true } },
    },
  });

  // Decimal is not serializable across the RSC boundary -> Number().
  // eventDate is formatted here, not on the client, so the server's ICU is
  // the only one that ever runs (no hydration locale mismatch).
  const rows: ContractRow[] = contracts.map((contract) => ({
    id: contract.id,
    folio: contract.folio,
    clientName: contract.clientName,
    eventType: contract.eventType,
    eventDateLabel: dateFormatter.format(contract.eventDate),
    contractStatus: contract.contractStatus,
    paymentStatus: contract.paymentStatus,
    balance: Number(contract.balance),
    priceListId: contract.priceListId,
    priceListName: contract.priceList.name,
    createdByName: contract.createdBy.name,
    // Spec §4.2 point 4. Already selected by the unqualified `findMany` above
    // — these are plain scalar columns on `contracts`, no join, no migration.
    imageGenerated: contract.imageGenerated,
    driveUploaded: contract.driveUploaded,
    calendarCreated: contract.calendarCreated,
    emailSent: contract.emailSent,
    // Not a status column: a contract with no `clientEmail` has no email
    // step at all, so it must not be counted as pending (see `DeliverySteps`).
    hasClientEmail: contract.clientEmail != null && contract.clientEmail.trim() !== "",
  }));

  const { estado, q, tipoEvento, listaPrecios, estatusPago, pendientes } = await searchParams;

  const isSuper = session.user.role === "super";

  return (
    <>
      <PageHeader
        title="Contratos"
        subtitle={
          isSuper
            ? `Todos los contratos del sistema (${rows.length}).`
            : `Sus contratos creados (${rows.length}).`
        }
        actions={
          <Button size="lg" render={<Link href="/contratos/nuevo" />}>
            Nuevo contrato
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
        <ContractsListView
          contracts={rows}
          showCreatedBy={isSuper}
          initialFilters={{
            estado: estado ?? "todos",
            q: q ?? "",
            tipoEvento: tipoEvento ?? "todos",
            listaPrecios: listaPrecios ?? "todos",
            estatusPago: estatusPago ?? "todos",
            pendientes: pendientes === "1",
          }}
        />
      </div>
    </>
  );
}
