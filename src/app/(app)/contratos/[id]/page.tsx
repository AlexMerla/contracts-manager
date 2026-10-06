import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  FileImage,
  HardDrive,
  Link2,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { scopeToOwner } from "@/lib/authorization";
import { contractViewerPath, tryContractViewerUrl } from "@/lib/app-url";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";
import { driveFileViewUrl } from "@/lib/google/drive";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
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

import { CopyViewerLink } from "./copy-viewer-link";
import { NotesTab } from "./notes-tab";
import { PaymentsTab } from "./payments-tab";
import { RegisterPaymentDialog } from "./register-payment-dialog";
import { ResendMenu } from "./resend-menu";
import { RetryImageButton } from "./retry-image-button";
import { RetryStepButton } from "./retry-step-button";

// `eventDate` is `@db.Date`, materialised as UTC midnight — timeZone: "UTC"
// avoids the local-timezone shift that would otherwise print the day
// before the real one on a negative-UTC-offset host (same hazard timeFormatter
// below already guards against for `eventTime`).
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" });
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
      // Sprint 8 tasks 1-3: both tabs now read real data. Ordered
      // chronologically (oldest first) so each reads as a running ledger —
      // payments by folio-assignment order, notes newest-last like a log.
      payments: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } },
    },
  });

  if (!contract) {
    notFound();
  }

  const total = Number(contract.total);
  const eventDateLabel = dateFormatter.format(contract.eventDate);

  // Sprint 8 task 2 / spec "Live Balance Derivation": `contracts.total` is a
  // creation-time snapshot (never rewritten); the amount actually collected
  // is always the live SUM of `payments`, never a stored column. The
  // displayed "saldo por cobrar" clamps at zero rather than going negative
  // on an accepted overpayment (design decision #6) — the row itself still
  // keeps the real amount paid.
  const totalPaid = contract.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balanceDue = Math.max(0, total - totalPaid);
  const paidForDisplay = Math.min(totalPaid, total > 0 ? total : totalPaid);

  return (
    <>
      <PageHeader
        title={`${contract.folio} · ${contract.clientName}`}
        breadcrumb={
          <Link
            href="/contratos"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Icon icon={ArrowLeft} className="size-3.5" />
            Contratos
          </Link>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill kind="contrato" value={contract.contractStatus} />
            <StatusPill kind="pago" value={contract.paymentStatus} />
            <Badge variant="secondary">{EVENT_TYPE_LABEL[contract.eventType]}</Badge>
            <span className="text-sm text-muted-foreground">
              Evento el {eventDateLabel} · creado por {contract.createdBy.name}
            </span>
          </span>
        }
        actions={
          <>
            {/* Client-facing redelivery only. Drive/Calendar/image retries
                are NOT folded in here — they repair internal artefacts and
                sit on their own row in "Documento y respaldos". */}
            <ResendMenu
              contractId={contract.id}
              hasEmail={Boolean(contract.clientEmail)}
              hasMobile={Boolean(contract.clientMobile)}
            />
            <RegisterPaymentDialog contractId={contract.id} balanceDue={balanceDue} variant="header" />
          </>
        }
      />

      <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-7 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Tabs defaultValue="resumen">
          <TabsList>
            <TabsTab value="resumen">Resumen</TabsTab>
            <TabsTab value="pagos" count={contract.payments.length}>
              Pagos
            </TabsTab>
            <TabsTab value="notas" count={contract.notes.length}>
              Notas
            </TabsTab>
          </TabsList>

          <TabsPanel value="resumen" className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Datos del contrato</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Cliente" value={contract.clientName} />
                <DetailField label="Tipo de evento" value={EVENT_TYPE_LABEL[contract.eventType]} />
                <DetailField label="Festejado(s)" value={contract.celebrated} />
                <DetailField label="Fecha del evento" value={eventDateLabel} />
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
                <CardTitle>Servicios contratados</CardTitle>
                <CardDescription>
                  Nombre y precio tomados del contrato al momento de crearse — no
                  reflejan cambios posteriores del catálogo (spec §6.5).
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10 shadow-sm">
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

                {contract.contractServiceSelections.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel>Opciones de servicio elegidas</SectionLabel>
                    {contract.contractServiceSelections.map((selection) => (
                      <div
                        key={selection.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">{selection.service.name}</span>
                        <span>{selection.selectedOption}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Saldo deliberately does NOT repeat here: the sidebar's
                    "Estado de cuenta" owns the money still owed (derived live
                    from SUM(payments)), and two places showing that same
                    figure is two places to drift. Anticipo is different — it
                    is the fixed amount agreed at signing (contracts.deposit,
                    frozen like subtotal/total), not something payments move,
                    so it belongs with the other frozen figures here. */}
                <div className="flex flex-col gap-2 border-t pt-4">
                  <AmountRow label="Subtotal" amount={Number(contract.subtotal)} />
                  {contract.discount != null && (
                    <AmountRow label="Descuento" amount={-Number(contract.discount)} />
                  )}
                  {contract.extraCharge != null && (
                    <AmountRow label="Cargo extra" amount={Number(contract.extraCharge)} />
                  )}
                  <AmountRow label="Total" amount={total} emphasize />
                  <AmountRow label="Anticipo acordado" amount={Number(contract.deposit)} />
                </div>
              </CardContent>
            </Card>
          </TabsPanel>

          <TabsPanel value="pagos">
            <PaymentsTab
              payments={contract.payments.map((payment) => ({
                id: payment.id,
                folio: payment.folio,
                paymentDate: payment.paymentDate,
                concept: payment.concept,
                method: payment.method,
                amount: Number(payment.amount),
              }))}
            />
          </TabsPanel>

          <TabsPanel value="notas">
            <NotesTab
              contractId={contract.id}
              notes={contract.notes.map((note) => ({
                id: note.id,
                text: note.text,
                createdAt: note.createdAt,
                authorName: note.user.name,
              }))}
            />
          </TabsPanel>
        </Tabs>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Estado de cuenta</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <SectionLabel>Saldo por cobrar</SectionLabel>
                <Money
                  amount={balanceDue}
                  tone={balanceDue > 0 ? "negative" : "muted"}
                  className="font-heading text-2xl font-semibold"
                />
              </div>

              {/* Sprint 8 task 2 / spec "Live Balance Derivation": real money
                  collected, derived live from SUM(payments) — never the
                  frozen `contracts.balance` snapshot. Same zero-total clamp
                  as the creation wizard's step 5 (step-confirm.tsx). */}
              <div className="flex flex-col gap-2">
                <Progress tone="auto" value={Math.max(0, paidForDisplay)} max={total > 0 ? total : 1} />
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Cobrado</span>
                  <Money amount={totalPaid} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {total > 0 ? (
                    <>
                      Cobrado <Money amount={totalPaid} /> de <Money amount={total} />.
                    </>
                  ) : (
                    "El total del contrato es cero, no hay nada que cobrar."
                  )}
                </p>
              </div>

              {balanceDue > 0 && (
                <Alert
                  tone="warning"
                  icon={CircleAlert}
                  title="Saldo pendiente antes del evento"
                  description={
                    <>
                      Faltan <Money amount={balanceDue} /> y el evento es el {eventDateLabel}. Cobre
                      el saldo antes de esa fecha.
                    </>
                  }
                />
              )}

              <RegisterPaymentDialog contractId={contract.id} balanceDue={balanceDue} variant="sidebar" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documento y respaldos</CardTitle>
              <CardDescription>
                Cada paso que no se haya completado se reintenta desde su propia fila.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Spec §4.2: a visual indicator plus a manual retry action for
                  an incomplete delivery step. Sprint-06 task 8's independence
                  rule still holds — each row reads its own status column, so a
                  contract with `driveUploaded = true` and `calendarCreated =
                  false` shows only the Calendar retry. */}
              <BackupRow
                icon={FileImage}
                label="Contrato generado (imagen)"
                action={
                  contract.imageGenerated ? (
                    <ExternalAction
                      href={`${contractViewerPath(contract.viewerToken)}/image`}
                      label="Ver"
                    />
                  ) : (
                    <PendingAction>
                      <RetryImageButton contractId={contract.id} label="Reintentar" />
                    </PendingAction>
                  )
                }
              />

              <BackupRow
                icon={HardDrive}
                label="Respaldo en Google Drive"
                action={
                  !contract.driveUploaded ? (
                    <PendingAction>
                      <RetryStepButton contractId={contract.id} step="drive" />
                    </PendingAction>
                  ) : contract.driveFileId ? (
                    <div className="flex items-center gap-2">
                      <ExternalAction href={driveFileViewUrl(contract.driveFileId)} label="Abrir" />
                      {/* A contract created before the pre-contract pair
                          existed has no second file; its row simply omits
                          this link rather than offering a dead one. */}
                      {contract.preContractDriveFileId && (
                        <ExternalAction
                          href={driveFileViewUrl(contract.preContractDriveFileId)}
                          label="Precontrato"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Subido</span>
                  )
                }
              />

              <BackupRow
                icon={CalendarDays}
                label="Evento en Google Calendar"
                action={
                  !contract.calendarCreated ? (
                    <PendingAction>
                      <RetryStepButton contractId={contract.id} step="calendar" />
                    </PendingAction>
                  ) : contract.calendarEventUrl ? (
                    <ExternalAction href={contract.calendarEventUrl} label="Abrir" />
                  ) : (
                    // Created before `calendar_event_url` existed. The next
                    // sync of this contract's event records the link; until
                    // then there is nothing to open.
                    <span className="text-sm text-muted-foreground">Creado</span>
                  )
                }
              />

              {/* Sprint 7 task 5 — unconditional, on every contract: the
                  ManyChat trigger has no status column, so its failure is
                  silent and this link is the only way staff can recover from
                  it. It must stay visible and copyable, which is why it is a
                  full-width block here and not hidden behind the header menu
                  (the menu only re-triggers delivery; it never shows the URL). */}
              <div className="flex flex-col gap-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Icon icon={Link2} className="size-4 text-muted-foreground" />
                  <span className="text-sm">Enlace para el cliente</span>
                </div>
                <CopyViewerLink url={tryContractViewerUrl(contract.viewerToken)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cancelación</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Si el evento no se realizará, cancele el contrato indicando el motivo. El
                historial se conserva.
              </p>
              {/* Visual only. `cancellation_reason` exists in the schema but
                  there is NO cancellation Server Action in this codebase, and
                  this change deliberately does not add one — a control that
                  writes nothing must also look like it writes nothing. */}
              <Button type="button" variant="destructive" disabled>
                Cancelar contrato
              </Button>
              <p className="text-xs text-muted-foreground">
                La cancelación todavía no está disponible.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel>{label}</SectionLabel>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

/** A quiet "Pendiente" dot ahead of the retry control — same vocabulary as
 * the contracts list's `DeliveryStatus` badge (`Badge variant="warning" dot`),
 * so a reader who already knows that color/word from the list recognizes it
 * here too. Without this, a pending row and a completed row read as two
 * equally-plain buttons side by side, and nothing marks which one is the
 * exception. */
function PendingAction({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="warning" dot>
        Pendiente
      </Badge>
      {children}
    </div>
  );
}

function BackupRow({
  icon,
  label,
  action,
}: {
  icon: React.ComponentProps<typeof Icon>["icon"];
  label: string;
  action: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon icon={icon} className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm">{label}</span>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** Opens a Google-hosted (or app-hosted) artefact in a new tab. `noreferrer`
 * alongside `noopener` so the Drive/Calendar URL never leaks this app's
 * internal contract URL as a referrer. */
function ExternalAction({ href, label }: { href: string; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      render={<a href={href} target="_blank" rel="noopener noreferrer" />}
    >
      {label}
    </Button>
  );
}

function AmountRow({
  label,
  amount,
  emphasize = false,
  tone,
}: {
  label: string;
  amount: number;
  emphasize?: boolean;
  tone?: "positive" | "negative" | "muted";
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
      <Money amount={amount} tone={tone} />
    </div>
  );
}
