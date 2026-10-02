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
    },
  });

  if (!contract) {
    notFound();
  }

  const total = Number(contract.total);
  const deposit = Number(contract.deposit);
  const balance = Number(contract.balance);
  const eventDateLabel = dateFormatter.format(contract.eventDate);

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
            {/* Visual only until Sprint 8 builds `payments`: there is no
                payment Server Action yet, so this must never look clickable. */}
            <Button type="button" size="sm" disabled>
              Registrar pago
            </Button>
          </>
        }
      />

      <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-7 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Tabs defaultValue="resumen">
          <TabsList>
            <TabsTab value="resumen">Resumen</TabsTab>
            {/* `payments` and `notes` exist as Prisma models but no
                application code reads or writes them yet (Sprint 8). They are
                shown disabled rather than hidden so the shape of the finished
                screen is visible — with an explicit "Pronto" badge instead of
                a fabricated count, which would read as real data. */}
            <TabsTab value="pagos" disabled>
              Pagos
              <Badge variant="secondary">Pronto</Badge>
            </TabsTab>
            <TabsTab value="notas" disabled>
              Notas
              <Badge variant="secondary">Pronto</Badge>
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

                {/* Anticipo and Saldo deliberately do NOT repeat here: the
                    sidebar's "Estado de cuenta" owns the money still owed, and
                    two places showing the same balance is two places to drift. */}
                <div className="flex flex-col gap-2 border-t pt-4">
                  <AmountRow label="Subtotal" amount={Number(contract.subtotal)} />
                  {contract.discount != null && (
                    <AmountRow label="Descuento" amount={-Number(contract.discount)} />
                  )}
                  {contract.extraCharge != null && (
                    <AmountRow label="Cargo extra" amount={Number(contract.extraCharge)} />
                  )}
                  <AmountRow label="Total" amount={total} emphasize />
                </div>
              </CardContent>
            </Card>
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
                  amount={balance}
                  tone={balance > 0 ? "negative" : "muted"}
                  className="font-heading text-2xl font-semibold"
                />
              </div>

              {/* Same clamp as the creation wizard's step 5 (step-confirm.tsx):
                  a discount larger than the subtotal makes `total` negative,
                  and a negative `value` or a `max` of 0 makes the Base UI
                  track render nonsense.

                  Labelled "Anticipo", never "Cobrado": `payments` has no
                  application code yet, so the only money this system knows
                  about is the deposit agreed at creation time — calling it
                  "cobrado" would imply payments that were never recorded. */}
              <div className="flex flex-col gap-2">
                <Progress
                  tone="auto"
                  value={Math.max(0, Math.min(deposit, total))}
                  max={total > 0 ? total : 1}
                />
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Anticipo</span>
                  <Money amount={deposit} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {total > 0
                    ? `Cubre ${Math.round((Math.max(0, Math.min(deposit, total)) / total) * 100)}% del total.`
                    : "El total del contrato es cero, no hay porcentaje que cubrir."}
                </p>
              </div>

              {balance > 0 && (
                <Alert
                  tone="warning"
                  icon={CircleAlert}
                  title="Saldo pendiente antes del evento"
                  description={
                    <>
                      Faltan <Money amount={balance} /> y el evento es el {eventDateLabel}. Cobre
                      el saldo antes de esa fecha.
                    </>
                  }
                />
              )}

              {/* Visual only — see the header button. */}
              <Button type="button" className="w-full" disabled>
                Registrar pago
              </Button>
              <p className="text-xs text-muted-foreground">
                El registro de pagos todavía no está disponible; llega con el módulo de pagos.
              </p>
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
                    <RetryImageButton contractId={contract.id} label="Reintentar" />
                  )
                }
              />

              <BackupRow
                icon={HardDrive}
                label="Respaldo en Google Drive"
                action={
                  !contract.driveUploaded ? (
                    <RetryStepButton contractId={contract.id} step="drive" />
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
                    <RetryStepButton contractId={contract.id} step="calendar" />
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
