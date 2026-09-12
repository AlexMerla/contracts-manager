import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { scopeToOwner } from "@/lib/authorization";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import { StatusPill } from "@/components/status-pill";
import { PageHeader } from "@/components/page-header";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "short" });

// Spec §5: `normal` sees only contracts where `createdById = self`, `super`
// sees all. Enforced at the data-access layer via `scopeToOwner` (not just
// by hiding rows in the UI) — sprint-04 task 8's "a normal user's list never
// includes another user's contracts".
export default async function ContratosPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const db = scopeToOwner(session);
  const contracts = await db.contract.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        title="Contratos"
        subtitle={
          session.user.role === "super"
            ? "Todos los contratos del sistema."
            : "Sus contratos creados."
        }
        actions={
          <Button render={<Link href="/contratos/nuevo" />}>Nuevo contrato</Button>
        }
      />
      <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                {session.user.role === "super" && <TableHead>Creado por</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={session.user.role === "super" ? 8 : 7}
                    className="text-center text-muted-foreground"
                  >
                    Ningún contrato coincide con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/contratos/${contract.id}`} className="hover:underline">
                      {contract.folio}
                    </Link>
                  </TableCell>
                  <TableCell>{contract.clientName}</TableCell>
                  <TableCell>{contract.eventType}</TableCell>
                  <TableCell>{dateFormatter.format(contract.eventDate)}</TableCell>
                  <TableCell>
                    <StatusPill kind="contrato" value={contract.contractStatus} />
                  </TableCell>
                  <TableCell>
                    <StatusPill kind="pago" value={contract.paymentStatus} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money amount={Number(contract.balance)} />
                  </TableCell>
                  {session.user.role === "super" && (
                    <TableCell>{contract.createdBy.name}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
