import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real database, no Prisma mocks — same established pattern as
// payments-actions.test.ts. Only `auth()` and the Google Calendar upsert are
// mocked: the former so the role gate resolves against real user rows, the
// latter so no test can reach the network (spec §4.2 work is verified by its
// own suite).
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { mockUpsertCalendarEvent } = vi.hoisted(() => ({
  mockUpsertCalendarEvent: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/google/calendar", () => ({
  upsertContractCalendarEvent: mockUpsertCalendarEvent,
}));

import { ForbiddenError } from "@/lib/authorization";
import { todayInAppTimeZone } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { cancelContract } from "@/app/(app)/contratos/[id]/actions";

const superUserId = randomUUID();
const normalUserId = randomUUID();
const priceListId = randomUUID();

const superSession = {
  user: { id: superUserId, role: "super" as const, name: "Super", email: "cancel-super@example.com" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};
const normalSession = {
  user: { id: normalUserId, role: "normal" as const, name: "Normal", email: "cancel-normal@example.com" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const createdContractIds: string[] = [];

// Same `CT-` prefix rule as payments-actions.test.ts — see its comment: any
// other non-numeric prefix corrupts `nextFolio` for every suite in the run.
function throwawayFolio(): string {
  return `CT-CANCEL-${randomUUID().slice(0, 8)}`;
}

async function createThrowawayContract(options: {
  eventDate: Date;
  contractStatus?: "pre_contract" | "confirmed" | "completed" | "cancelled";
  createdById?: string;
  calendarEventId?: string;
}) {
  const contract = await prisma.contract.create({
    data: {
      folio: throwawayFolio(),
      clientName: "Cliente de prueba (cancelación)",
      eventType: "wedding",
      eventDate: options.eventDate,
      subtotal: 5000,
      total: 5000,
      deposit: 1000,
      balance: 4000,
      viewerToken: randomUUID(),
      priceListId,
      createdById: options.createdById ?? normalUserId,
      ...(options.contractStatus ? { contractStatus: options.contractStatus } : {}),
      ...(options.calendarEventId ? { calendarEventId: options.calendarEventId } : {}),
    },
  });
  createdContractIds.push(contract.id);
  return contract;
}

/**
 * `eventDate` as UTC midnight, offset from the action's OWN notion of today.
 *
 * Gotcha worth keeping: an earlier version of this helper built the offset
 * from `new Date().getUTCDate()`, and the "event in the past" case silently
 * passed whenever the host's UTC date had already rolled over past Mexico's
 * (any evening run), because "yesterday in UTC" is "today in Mexico". The
 * assertion must be anchored to `todayInAppTimeZone`, the same clock the
 * action reads.
 */
function daysFromToday(days: number): Date {
  return addDaysUtc(todayInAppTimeZone(), days);
}

function addDaysUtc(base: Date, days: number): Date {
  const shifted = new Date(base);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

describe("cancelContract", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(superSession);
    mockUpsertCalendarEvent.mockClear();
  });

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: superUserId,
          name: "Throwaway Cancel Super",
          email: "cancel-super@example.com",
          passwordHash: "unused-in-this-test",
          role: "super",
        },
        {
          id: normalUserId,
          name: "Throwaway Cancel Normal",
          email: "cancel-normal@example.com",
          passwordHash: "unused-in-this-test",
          role: "normal",
        },
      ],
    });

    await prisma.priceList.create({
      data: { id: priceListId, name: "Throwaway price list (cancel)", isDefault: false, active: true },
    });
  });

  afterAll(async () => {
    if (createdContractIds.length > 0) {
      await prisma.note.deleteMany({ where: { contractId: { in: createdContractIds } } });
      await prisma.payment.deleteMany({ where: { contractId: { in: createdContractIds } } });
      await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
      createdContractIds.length = 0;
    }
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.user.deleteMany({ where: { id: { in: [superUserId, normalUserId] } } });
  });

  // Spec §6.4: both columns persist. Resolved Q8: the audit entry is a Note.
  it("writes contract_status and cancellation_reason and appends an audit note", async () => {
    const contract = await createThrowawayContract({ eventDate: daysFromToday(30) });

    const result = await cancelContract({
      contractId: contract.id,
      reason: "  El cliente canceló el evento.  ",
    });
    expect(result).toEqual({ success: true });

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.contractStatus).toBe("cancelled");
    expect(after.cancellationReason).toBe("El cliente canceló el evento.");

    // Money columns are frozen snapshots — cancellation never rewrites them.
    expect(Number(after.total)).toBe(5000);
    expect(Number(after.deposit)).toBe(1000);
    expect(Number(after.balance)).toBe(4000);

    const notes = await prisma.note.findMany({ where: { contractId: contract.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("Contrato cancelado por Super: El cliente canceló el evento.");
    expect(notes[0].userId).toBe(superUserId);
  });

  // Spec §5 L106 — the whole point of the role gate: `normal` is rejected
  // even on a contract it OWNS. Not a hidden button; a thrown rejection at
  // the action itself.
  it("rejects a normal session even on its own contract, and writes nothing", async () => {
    const contract = await createThrowawayContract({
      eventDate: daysFromToday(30),
      createdById: normalUserId,
    });

    mockAuth.mockResolvedValueOnce(normalSession);
    await expect(
      cancelContract({ contractId: contract.id, reason: "Intento no autorizado." })
    ).rejects.toThrow(ForbiddenError);

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.contractStatus).toBe("pre_contract");
    expect(after.cancellationReason).toBeNull();
    expect(await prisma.note.count({ where: { contractId: contract.id } })).toBe(0);
  });

  it("rejects an empty or whitespace-only reason and writes nothing", async () => {
    const contract = await createThrowawayContract({ eventDate: daysFromToday(30) });

    const result = await cancelContract({ contractId: contract.id, reason: "   " });
    expect(result).toEqual({ error: "Escriba el motivo de la cancelación." });

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.contractStatus).toBe("pre_contract");
    expect(after.cancellationReason).toBeNull();
  });

  // Resolved Q2.
  it("blocks a contract whose event date is already in the past", async () => {
    const contract = await createThrowawayContract({ eventDate: daysFromToday(-1) });

    const result = await cancelContract({ contractId: contract.id, reason: "Ya pasó." });
    expect(result).toEqual({
      error:
        "El evento de este contrato ya pasó. Un contrato con evento en el pasado no se puede cancelar.",
    });

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.contractStatus).toBe("pre_contract");
    expect(after.cancellationReason).toBeNull();
  });

  // A same-day event is still cancellable — the boundary is `<`, not `<=`,
  // and "today" is read in the app's own time zone.
  it("allows a contract whose event is today", async () => {
    const contract = await createThrowawayContract({ eventDate: daysFromToday(0) });

    const result = await cancelContract({ contractId: contract.id, reason: "Se canceló hoy." });
    expect(result).toEqual({ success: true });
  });

  // Idempotency guard: the second call must not overwrite the first reason,
  // nor append a second audit note.
  it("returns a clean error on an already-cancelled contract and writes nothing", async () => {
    const contract = await createThrowawayContract({ eventDate: daysFromToday(30) });

    expect(await cancelContract({ contractId: contract.id, reason: "Motivo original." })).toEqual({
      success: true,
    });
    const second = await cancelContract({ contractId: contract.id, reason: "Motivo nuevo." });
    expect(second).toEqual({ error: "El contrato ya está cancelado." });

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.cancellationReason).toBe("Motivo original.");
    expect(await prisma.note.count({ where: { contractId: contract.id } })).toBe(1);
  });

  it("returns a plain not-found for an unknown contract id", async () => {
    const result = await cancelContract({ contractId: randomUUID(), reason: "No existe." });
    expect(result).toEqual({ error: "Contrato no encontrado." });
  });

  // Resolved Q4 — the retitle runs only when there is an event to retitle,
  // and only AFTER the business write has committed.
  it("retitles the Google Calendar event only when the contract has one", async () => {
    const withoutEvent = await createThrowawayContract({ eventDate: daysFromToday(30) });
    await cancelContract({ contractId: withoutEvent.id, reason: "Sin evento en Calendar." });
    expect(mockUpsertCalendarEvent).not.toHaveBeenCalled();

    const withEvent = await createThrowawayContract({
      eventDate: daysFromToday(30),
      calendarEventId: "google-event-123",
    });
    await cancelContract({ contractId: withEvent.id, reason: "Con evento en Calendar." });
    expect(mockUpsertCalendarEvent).toHaveBeenCalledExactlyOnceWith(withEvent.id);
  });
});
