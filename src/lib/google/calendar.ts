import type { EventType } from "@/generated/prisma/client";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";
import { googleApiFetch, type ContractDeliveryStepResult } from "@/lib/google/api-client";
import { driveFileViewUrl } from "@/lib/google/drive";
import { prisma } from "@/lib/prisma";

// Sprint-06 task 7 — create/update the contract's event on the Master calendar.

const CALENDAR_EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** The business operates in Mexico (spec §0: product-facing locale es-MX), so
 * every event's wall-clock time is sent with this IANA zone rather than
 * relying on whatever zone the serverless instance happens to run in. */
export const EVENT_TIME_ZONE = "America/Mexico_City";

/** `contracts` has no duration column (spec §6.4) and the spec defines none,
 * so a timed event gets a fixed placeholder block the operator can drag in
 * Google Calendar. A display convention, not a business rule. */
export const DEFAULT_EVENT_DURATION_HOURS = 4;

/** The slice of the Calendar v3 `Event` resource this module reads back.
 * `htmlLink` is the "open in Google Calendar" URL the API returns on both
 * `POST` (insert) and `PUT` (update); it is declared optional because the
 * field is not contractually guaranteed on every response shape, and the
 * caller must survive its absence by simply not recording a URL. */
interface CalendarEvent {
  id: string;
  htmlLink?: string;
}

type CalendarDateTime = { date: string } | { dateTime: string; timeZone: string };

export interface GoogleCalendarEventBody {
  summary: string;
  description: string;
  location?: string;
  start: CalendarDateTime;
  end: CalendarDateTime;
}

/** One quoted package's line in the Calendar description. `name` is the
 * contract's OWN `nameSnapshot` (spec §6.5 — never the live package name);
 * `category` is read live from the catalog because it is informational
 * grouping, not something that determines money owed. */
export interface ContractCalendarPackage {
  name: string;
  quantity: number;
  category: string | null;
  /** `"Servicio: Opción"` lines for services attached to this package that
   * have a recorded selection on this contract. */
  options: string[];
}

/** The contract fields the event body is derived from. */
export interface ContractCalendarSource {
  folio: string;
  clientName: string;
  eventType: EventType;
  /** Prisma `@db.Date` — always UTC midnight, so UTC getters read the stored day. */
  eventDate: Date;
  /** Prisma `@db.Time(6)` — materialised as `1970-01-01T<hh:mm>:00.000Z`. */
  eventTime: Date | null;
  celebrated: string | null;
  placeName: string | null;
  placeAddress: string | null;
  clientPhone: string | null;
  clientMobile: string | null;
  clientAddress: string | null;
  clientEmail: string | null;
  packages: ContractCalendarPackage[];
  /** OFFICIAL contract's Drive file id. Link is omitted entirely when null
   * (product owner's decision); harmless because Calendar `PUT`s a full
   * replacement body, so the link simply appears on the next run once Drive
   * has completed. */
  driveFileId: string | null;
  /** Pre-contract's Drive file id — same omit-when-null rule as `driveFileId`. */
  preContractDriveFileId: string | null;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoHourMinute(time: Date): string {
  return time.toISOString().slice(11, 16);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

/** Adds hours to a zone-less `YYYY-MM-DDTHH:mm` stamp, doing the arithmetic in
 * UTC purely as a calendar helper and re-emitting a zone-less stamp — the
 * `timeZone` field on the event is what gives it meaning. Mexico abolished DST
 * in 2022, so there is no wall-clock discontinuity to compensate for. */
function addHoursToNaive(naive: string, hours: number): string {
  const date = new Date(`${naive}:00.000Z`);
  date.setUTCHours(date.getUTCHours() + hours);
  return `${date.toISOString().slice(0, 16)}:00`;
}

/** Builds one description block: a heading followed by `- Label: value`
 * lines, dropping any line whose value is empty/whitespace-only and dropping
 * the WHOLE section (heading included) when every line would be empty. */
function section(heading: string, entries: [string, string | null][]): string[] {
  const lines = entries
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([label, value]) => `- ${label}: ${value}`);
  return lines.length > 0 ? [heading, ...lines] : [];
}

// Legacy shape, events-manager/services/contract/index.ts lines 165-187:
// "- Paquete(xN) [Categoría] + opción1 + opción2 ...".
function formatPackageLine(pkg: ContractCalendarPackage): string {
  const category = pkg.category ? ` [${pkg.category}]` : "";
  const options = pkg.options.length > 0 ? ` + ${pkg.options.join(" + ")}` : "";
  return `- ${pkg.name}(x${pkg.quantity})${category}${options}`;
}

export interface CalendarPackageRow {
  nameSnapshot: string;
  quantity: number;
  package: {
    category: { name: string } | null;
    packageServices: { serviceId: string; service: { name: string } }[];
  };
}

export interface CalendarSelectionRow {
  serviceId: string;
  selectedOption: string;
}

/** Pure — reconstructs each quoted package's attached service options.
 * `contract_service_selections` stores only `(contractId, serviceId,
 * selectedOption)` (spec §6.8) and a `Service` can belong to many `Package`s
 * via `package_services`, so there is no direct selection→package link: this
 * walks each package's own services and picks up any service that has a
 * selection on this contract. Accepted limitation: when two quoted packages
 * share a service, the single selection is listed under BOTH — the data
 * model can't distinguish them, and duplicating is the safe failure. */
export function buildCalendarPackages(
  rows: CalendarPackageRow[],
  selections: CalendarSelectionRow[]
): ContractCalendarPackage[] {
  const optionByServiceId = new Map(
    selections.map((selection) => [selection.serviceId, selection.selectedOption])
  );

  return rows.map((row) => ({
    name: row.nameSnapshot,
    quantity: row.quantity,
    category: row.package.category?.name ?? null,
    options: row.package.packageServices.flatMap((link) => {
      const selected = optionByServiceId.get(link.serviceId);
      return selected ? [`${link.service.name}: ${selected}`] : [];
    }),
  }));
}

/** Pure — builds the Calendar v3 event body from contract data. Exported so it
 * can be unit-tested without a Google connection. */
export function buildContractCalendarEvent(
  contract: ContractCalendarSource
): GoogleCalendarEventBody {
  const day = isoDay(contract.eventDate);
  const eventTypeLabel = EVENT_TYPE_LABEL[contract.eventType];

  const blocks: string[][] = [
    section("👤 CLIENTE:", [
      ["Nombre", contract.clientName],
      ["Dirección", contract.clientAddress],
      ["Correo", contract.clientEmail],
      ["Teléfono", contract.clientPhone],
      ["Celular/Whatsapp", contract.clientMobile],
    ]),
    section("📌 LUGAR DEL EVENTO:", [
      ["Nombre", contract.placeName],
      ["Dirección", contract.placeAddress],
    ]),
    section("🎉 FESTEJADOS:", [["Nombres", contract.celebrated]]),
    contract.packages.length > 0
      ? ["📦 SERVICIOS:", ...contract.packages.map(formatPackageLine)]
      : [],
    [`FOLIO: ${contract.folio}`],
    section("📎 ARCHIVOS:", [
      ["Contrato", contract.driveFileId ? driveFileViewUrl(contract.driveFileId) : null],
      [
        "Precontrato",
        contract.preContractDriveFileId ? driveFileViewUrl(contract.preContractDriveFileId) : null,
      ],
    ]),
  ];

  const description = blocks
    .filter((block) => block.length > 0)
    .map((block) => block.join("\n"))
    .join("\n\n");

  const location = [contract.placeName, contract.placeAddress].filter(Boolean).join(" - ");

  const base = {
    summary: `${eventTypeLabel} — ${contract.clientName} (${contract.folio})`,
    description,
    ...(location ? { location } : {}),
  };

  // No time recorded → an all-day event. Calendar's all-day `end.date` is
  // exclusive, hence +1 day for a single-day event.
  if (!contract.eventTime) {
    return { ...base, start: { date: day }, end: { date: addDays(day, 1) } };
  }

  const startNaive = `${day}T${isoHourMinute(contract.eventTime)}`;
  return {
    ...base,
    start: { dateTime: `${startNaive}:00`, timeZone: EVENT_TIME_ZONE },
    end: {
      dateTime: addHoursToNaive(startNaive, DEFAULT_EVENT_DURATION_HOURS),
      timeZone: EVENT_TIME_ZONE,
    },
  };
}

/**
 * Creates or updates the contract's calendar event and records
 * `calendarEventId` / `calendarCreated`. Never throws for an API failure
 * (spec §4.2).
 *
 * Idempotency differs from Drive's on purpose: task 7's "done when" requires a
 * re-run to UPDATE the existing event, not skip. So there is no early return
 * on `calendarCreated === true` — a stored `calendarEventId` means `PUT`
 * (a full replace, so the event always mirrors current contract data),
 * otherwise `POST`. If the stored event was deleted in Google (404) or purged
 * (410), it falls back to creating a fresh one and re-points the column.
 */
export async function upsertContractCalendarEvent(
  contractId: string
): Promise<ContractDeliveryStepResult> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      folio: true,
      clientName: true,
      eventType: true,
      eventDate: true,
      eventTime: true,
      celebrated: true,
      placeName: true,
      placeAddress: true,
      clientPhone: true,
      clientMobile: true,
      clientAddress: true,
      clientEmail: true,
      driveFileId: true,
      preContractDriveFileId: true,
      calendarEventId: true,
      contractPackages: {
        orderBy: { nameSnapshot: "asc" },
        select: {
          nameSnapshot: true,
          quantity: true,
          package: {
            select: {
              category: { select: { name: true } },
              packageServices: { select: { serviceId: true, service: { select: { name: true } } } },
            },
          },
        },
      },
      contractServiceSelections: { select: { serviceId: true, selectedOption: true } },
    },
  });
  if (!contract) {
    return { ok: false, message: "Contrato no encontrado." };
  }

  const body = JSON.stringify(
    buildContractCalendarEvent({
      ...contract,
      packages: buildCalendarPackages(contract.contractPackages, contract.contractServiceSelections),
    })
  );

  if (contract.calendarEventId) {
    const updated = await googleApiFetch<CalendarEvent>({
      url: `${CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(contract.calendarEventId)}`,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      operation: "actualizar el evento del contrato en Calendar",
    });

    if (updated.ok) {
      await prisma.contract.update({
        where: { id: contractId },
        // `htmlLink` is recorded on the UPDATE path too, not just on create:
        // a contract created before this column existed has `calendarEventId`
        // but no URL, and the next re-run (confirm or manual retry) is what
        // backfills it — no data migration needed.
        data: {
          calendarCreated: true,
          ...(updated.data.htmlLink ? { calendarEventUrl: updated.data.htmlLink } : {}),
        },
      });
      return { ok: true };
    }

    const eventIsGone =
      updated.reason === "request_failed" && (updated.status === 404 || updated.status === 410);
    if (!eventIsGone) {
      return { ok: false, message: updated.message };
    }
  }

  const created = await googleApiFetch<CalendarEvent>({
    url: CALENDAR_EVENTS_ENDPOINT,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    operation: "crear el evento del contrato en Calendar",
  });
  if (!created.ok) {
    return { ok: false, message: created.message };
  }

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      calendarCreated: true,
      calendarEventId: created.data.id,
      // Null-out on re-create: the previous URL pointed at the event that
      // 404'd/410'd above, so keeping it would link staff to a dead event.
      calendarEventUrl: created.data.htmlLink ?? null,
    },
  });

  return { ok: true };
}
