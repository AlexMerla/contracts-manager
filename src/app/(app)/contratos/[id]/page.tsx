import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { scopeToOwner } from "@/lib/authorization";
import { Icon } from "@/components/ui/icon";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
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

import { RetryImageButton } from "./retry-image-button";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" });
const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

interface ContratoDetailPageProps {
  params: Promise<{ id: string }>;
}

// Spec §5: `normal` may only view a contract where `createdById = self`;
// `scopeToOwner` makes `findUnique` return `null` for a contract the
// session doesn't own, which this renders as a plain 404 — a `normal` user
// gets no signal that another user's contract even exists at that id.
export default async function ContratoDetailPage({ params }: ContratoDetailPageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  const db = scopeToOwner(session);
  const contract = await db.contract.findUnique({
    where: { id },
    include: {
      contractPackages: true,
      contractServiceSelections: { include: { service: true } },
      createdBy: { select: { name: true } },
      priceList: { select: { name: true } },
    },
  });

  if (!contract) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={`Contrato ${contract.folio}`}
        subtitle={contract.clientName}
        breadcrumb={
          <Link
            href="/contratos"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Icon icon={ArrowLeft} className="size-3.5" />
            Volver a contratos
          </Link>
        }
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-7 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <StatusPill kind="contrato" value={contract.contractStatus} />
                <StatusPill kind="pago" value={contract.paymentStatus} />
              </div>
              {/* Spec §4.2: a visual indicator plus a manual retry action
                  for an incomplete delivery step — only shown once it has
                  actually failed, not while it's merely pending sequential
                  processing at confirm time. */}
              {!contract.imageGenerated && <RetryImageButton contractId={contract.id} />}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Cliente" value={contract.clientName} />
            <DetailField label="Tipo de evento" value={contract.eventType} />
            <DetailField label="Festejado(s)" value={contract.celebrated} />
            <DetailField
              label="Fecha del evento"
              value={dateFormatter.format(contract.eventDate)}
            />
            <DetailField
              label="Hora del evento"
              value={contract.eventTime ? timeFormatter.format(contract.eventTime) : null}
            />
            <DetailField label="Lugar" value={contract.placeName} />
            <DetailField label="Dirección del lugar" value={contract.placeAddress} />
            <DetailField label="Teléfono" value={contract.clientPhone} />
            <DetailField label="Celular" value={contract.clientMobile} />
            <DetailField label="Correo" value={contract.clientEmail} />
            <DetailField label="Dirección del cliente" value={contract.clientAddress} />
            <DetailField label="Lista de precios" value={contract.priceList.name} />
            <DetailField label="Creado por" value={contract.createdBy.name} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paquetes contratados</CardTitle>
            <CardDescription>
              Nombre y precio tomados del contrato al momento de crearse — no
              reflejan cambios posteriores del catálogo (spec §6.5).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paquete</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio unitario</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contract.contractPackages.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.nameSnapshot}</TableCell>
                      <TableCell className="text-right">{line.quantity}</TableCell>
                      <TableCell className="text-right">
                        <Money amount={Number(line.priceSnapshot)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money amount={Number(line.priceSnapshot) * line.quantity} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {contract.contractServiceSelections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Opciones de servicio elegidas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {contract.contractServiceSelections.map((selection) => (
                <div key={selection.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{selection.service.name}</span>
                  <span>{selection.selectedOption}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Montos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <AmountRow label="Subtotal" amount={Number(contract.subtotal)} />
            {contract.discount != null && (
              <AmountRow label="Descuento" amount={-Number(contract.discount)} />
            )}
            {contract.extraCharge != null && (
              <AmountRow label="Cargo extra" amount={Number(contract.extraCharge)} />
            )}
            <AmountRow label="Total" amount={Number(contract.total)} emphasize />
            <AmountRow label="Anticipo" amount={Number(contract.deposit)} />
            <AmountRow label="Saldo" amount={Number(contract.balance)} emphasize />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

function AmountRow({
  label,
  amount,
  emphasize = false,
}: {
  label: string;
  amount: number;
  emphasize?: boolean;
}) {
  return (
    <div
      className={
        emphasize
          ? "flex items-center justify-between border-t pt-2 text-sm font-semibold"
          : "flex items-center justify-between text-sm"
      }
    >
      <span className={emphasize ? "" : "text-muted-foreground"}>{label}</span>
      <Money amount={amount} />
    </div>
  );
}
