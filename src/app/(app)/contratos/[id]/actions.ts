"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { requireRole, scopeToOwner } from "@/lib/authorization";
import { todayInAppTimeZone } from "@/lib/dates";
import { upsertContractCalendarEvent } from "@/lib/google/calendar";
import { nextPaymentFolio } from "@/lib/payments/folio";
import { resolvePaymentStatus } from "@/lib/payments/status";
import { prisma } from "@/lib/prisma";
import { Prisma, type PaymentStatus } from "@/generated/prisma/client";

import {
  addNoteSchema,
  cancelContractSchema,
  registerPaymentSchema,
  type AddNoteValues,
  type CancelContractValues,
  type RegisterPaymentValues,
} from "./schema";

// Spec §5: registering a payment or a note is allowed for both roles, scoped
// to the user's own contracts — same minimum as contract creation
// (src/app/(app)/contratos/actions.ts's requireSession).
async function requireSession() {
  const session = await auth();
  return requireRole(session, "normal");
}

// Spec §5 permission matrix, L106 (`Contracts — cancel | No | Yes`):
// cancellation is the ONLY `super`-exclusive contract operation. Deliberately
// NOT `scopeToOwner` — that helper returns the bare client for `super`, so
// pairing it with this gate would be a no-op that reads as if ownership
// mattered. The role gate is the whole check. Same defense-in-depth note as
// src/app/(app)/usuarios/actions.ts's `requireSuperSession`: a Server Action
// is a real network endpoint and must reject on its own, not rely on the UI
// hiding the button.
async function requireSuperSession() {
  const session = await auth();
  return requireRole(session, "super");
}

const MAX_FOLIO_ATTEMPTS = 3;

function isFolioCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    (error.meta.target as string[]).includes("folio")
  );
}

// Thrown (and caught) INSIDE the retry loop when the row lock below finds no
// contract — this can only happen if the contract was deleted between the
// ownership check and the transaction, which no code path in this app does,
// but failing loudly beats silently writing an orphan payment.
class ContractRowNotFoundError extends Error {}

// Thrown INSIDE registerPayment's transaction so the whole thing rolls back
// (nothing inserted, no status recomputed) — see the Q3 guard below.
class ContractCancelledError extends Error {}

interface LockedContractRow {
  id: string;
  contractStatus: string;
  paymentStatus: string;
  deposit: Prisma.Decimal;
  total: Prisma.Decimal;
}

export type RegisterPaymentResult =
  | { error: string }
  | { success: true; paymentId: string; folio: string };

// Sprint-08 tasks 1-3 / spec §12.6 — the only writer of `payments` and the
// only non-creation writer of `paymentStatus`/`contractStatus`. `total`,
// `deposit` and `balance` on `contracts` are NEVER touched here: they are
// `createContract`'s fixed, one-time snapshot (already printed on the
// generated contract image and in the email the client holds — see
// src/app/(app)/contratos/[id]/page.tsx's derived "Cobrado $X de $Y"). The
// only things this action writes are the new `Payment` row and, at most,
// the two status columns.
export async function registerPayment(
  input: RegisterPaymentValues
): Promise<RegisterPaymentResult> {
  const session = await requireSession();

  const parsed = registerPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  // Ownership check per spec §5, same shape as every other contract-scoped
  // action in this app: a `normal` user attempting another user's contract
  // gets the same "not found" response as a truly nonexistent id — no
  // existence leak. Done OUTSIDE the transaction, same as
  // `regenerateContractImage`, since `scopeToOwner`'s `$extends` client
  // can't participate in `prisma.$transaction`'s callback form.
  const db = scopeToOwner(session);
  const owned = await db.contract.findUnique({ where: { id: data.contractId }, select: { id: true } });
  if (!owned) {
    return { error: "Contrato no encontrado." };
  }

  for (let attempt = 1; attempt <= MAX_FOLIO_ATTEMPTS; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        // Row lock (design decision #2): `SELECT ... FOR UPDATE` is the
        // FIRST statement in the transaction, before the folio is even
        // generated. It serializes concurrent payments on this SAME
        // contract — without it, two simultaneous registrations could both
        // read `paymentStatus = "pending"`, both conclude they crossed the
        // deposit, and both fire `pre_contract -> confirmed` (harmless) but
        // could also both compute a stale `totalPaid` and clobber each
        // other's status write. Different contracts are untouched and stay
        // fully parallel.
        const [locked] = await tx.$queryRaw<LockedContractRow[]>(Prisma.sql`
          SELECT id,
                 contract_status AS "contractStatus",
                 payment_status  AS "paymentStatus",
                 deposit,
                 total
          FROM contracts
          WHERE id = ${data.contractId}
          FOR UPDATE
        `);
        if (!locked) {
          throw new ContractRowNotFoundError();
        }

        // Resolved Q3 (contract-cancellation): a cancelled contract accepts
        // no further payments. Checked INSIDE the lock, so a cancellation
        // committed a millisecond ago cannot be raced past. Thrown rather
        // than returned so the transaction rolls back and the retry loop
        // below stops immediately instead of re-attempting a folio.
        if (locked.contractStatus === "cancelled") {
          throw new ContractCancelledError();
        }

        const folio = await nextPaymentFolio(tx);

        const payment = await tx.payment.create({
          data: {
            contractId: data.contractId,
            folio,
            amount: data.amount,
            method: data.method,
            concept: data.concept,
            paymentDate: new Date(`${data.paymentDate}T00:00:00.000Z`),
            note: data.note.trim() || null,
            recordedById: session.user.id,
          },
        });

        // Live aggregate, computed INSIDE the same locked transaction —
        // never a denormalized "paid so far" column. This is the one and
        // only place `paymentStatus` is derived from.
        const { _sum } = await tx.payment.aggregate({
          where: { contractId: data.contractId },
          _sum: { amount: true },
        });
        const totalPaid = Number(_sum.amount ?? 0);

        const nextStatus = resolvePaymentStatus({
          previousStatus: locked.paymentStatus as PaymentStatus,
          totalPaid,
          deposit: Number(locked.deposit),
          total: Number(locked.total),
        });

        // Gated on contractStatus being pre_contract (spec: "Flip is gated
        // on contractStatus being pre_contract") — a contract already
        // cancelled or completed keeps its paymentStatus accurate but never
        // has its contractStatus silently resurrected by a late payment.
        const confirms = locked.contractStatus === "pre_contract" && nextStatus !== "pending";

        await tx.contract.update({
          where: { id: data.contractId },
          data: {
            paymentStatus: nextStatus,
            ...(confirms ? { contractStatus: "confirmed" as const } : {}),
          },
        });

        return payment;
      });

      // Re-renders the detail page: the Pagos tab, the sidebar's "Cobrado
      // $X de $Y", and the status pills all read fresh data.
      revalidatePath(`/contratos/${data.contractId}`);

      return { success: true, paymentId: created.id, folio: created.folio };
    } catch (error: unknown) {
      if (error instanceof ContractRowNotFoundError) {
        return { error: "Contrato no encontrado." };
      }
      if (error instanceof ContractCancelledError) {
        return {
          error: "El contrato está cancelado. No se pueden registrar más pagos.",
        };
      }
      if (isFolioCollision(error) && attempt < MAX_FOLIO_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }

  // Unreachable — the loop above always returns or throws.
  return { error: "No se pudo generar un folio único. Intente nuevamente." };
}

export type AddNoteResult = { error: string } | { success: true; noteId: string };

// Append-only (design decision #9) — no edit, no delete action exists for
// `notes`; this keeps the list a plain audit trail.
export async function addNote(input: AddNoteValues): Promise<AddNoteResult> {
  const session = await requireSession();

  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  // Same §5 ownership rule as registerPayment — no existence leak.
  const db = scopeToOwner(session);
  const owned = await db.contract.findUnique({ where: { id: data.contractId }, select: { id: true } });
  if (!owned) {
    return { error: "Contrato no encontrado." };
  }

  const note = await prisma.note.create({
    data: {
      contractId: data.contractId,
      userId: session.user.id,
      text: data.text,
    },
  });

  revalidatePath(`/contratos/${data.contractId}`);

  return { success: true, noteId: note.id };
}

export type CancelContractResult = { error: string } | { success: true };

interface LockedCancelRow {
  id: string;
  contractStatus: string;
  eventDate: Date;
  calendarEventId: string | null;
}

/** Outcome of the locked transaction: either a business-rule rejection
 *  (nothing written) or the committed cancellation plus the post-commit work
 *  it implies. A discriminated return rather than a thrown error because
 *  these are form-level messages, not exceptions. */
type CancelTransactionOutcome =
  | { blocked: string }
  | { blocked?: undefined; calendarEventId: string | null };

/**
 * Spec §6.4 / §12 item 5 — the ONLY writer of `contract_status = 'cancelled'`
 * and `cancellation_reason`.
 *
 * Deliberately NOT reversible: there is no un-cancel action (resolved Q7).
 * Money columns (`total`/`deposit`/`balance`) and `paymentStatus` are never
 * touched — same frozen-snapshot discipline as `registerPayment`: the figures
 * are already printed on the generated contract image and in the client's
 * email, and the payment history stays exactly as it was.
 */
export async function cancelContract(
  input: CancelContractValues
): Promise<CancelContractResult> {
  // Throws `ForbiddenError` for a `normal` session — including on a contract
  // that session OWNS. Cancellation is role-gated, never ownership-scoped.
  const session = await requireSuperSession();

  const parsed = cancelContractSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  // Resolved Q2: a contract whose event already happened cannot be cancelled.
  // `todayInAppTimeZone()` (not `new Date()`) because `eventDate` is
  // `@db.Date` — UTC midnight — and a UTC-hosted server would otherwise
  // consider it "tomorrow" after 18:00 in Mexico and reject a same-day event.
  const today = todayInAppTimeZone();

  let outcome: CancelTransactionOutcome;
  try {
    outcome = await prisma.$transaction(async (tx): Promise<CancelTransactionOutcome> => {
      // Same row lock, same first-statement position, as `registerPayment` —
      // it is the SAME contract row, so a concurrent cancel + payment
      // serialize against each other instead of interleaving.
      const [locked] = await tx.$queryRaw<LockedCancelRow[]>(Prisma.sql`
        SELECT id,
               contract_status   AS "contractStatus",
               event_date        AS "eventDate",
               calendar_event_id AS "calendarEventId"
        FROM contracts
        WHERE id = ${data.contractId}
        FOR UPDATE
      `);
      if (!locked) {
        throw new ContractRowNotFoundError();
      }

      // Idempotency guard, not a crash: re-submitting writes nothing and
      // would otherwise silently overwrite the original reason and append a
      // second audit note.
      if (locked.contractStatus === "cancelled") {
        return { blocked: "El contrato ya está cancelado." };
      }

      if (locked.eventDate.getTime() < today.getTime()) {
        return {
          blocked:
            "El evento de este contrato ya pasó. Un contrato con evento en el pasado no se puede cancelar.",
        };
      }

      await tx.contract.update({
        where: { id: data.contractId },
        data: { contractStatus: "cancelled", cancellationReason: data.reason },
      });

      // Resolved Q8 — the audit trail is a `Note`, not new columns:
      // `contracts` has no `cancelledAt`/`cancelledById`, and `notes` is
      // already the append-only log (addNote above has no edit or delete
      // counterpart). Written INSIDE the transaction so a cancelled contract
      // can never exist without its audit entry. The author's name is
      // inlined on purpose even though `notes.userId` already records it:
      // the text is a snapshot that survives a later rename, the same
      // discipline as `contract_packages.name_snapshot` (spec §6.5).
      await tx.note.create({
        data: {
          contractId: data.contractId,
          userId: session.user.id,
          text: `Contrato cancelado por ${session.user.name ?? "un usuario"}: ${data.reason}`,
        },
      });

      return { calendarEventId: locked.calendarEventId };
    });
  } catch (error: unknown) {
    if (error instanceof ContractRowNotFoundError) {
      return { error: "Contrato no encontrado." };
    }
    throw error;
  }

  if (outcome.blocked !== undefined) {
    return { error: outcome.blocked };
  }

  // Resolved Q4 — retitle, never delete. `upsertContractCalendarEvent` PUTs a
  // full replacement body, and `buildContractCalendarEvent` now prefixes
  // "[CANCELADO] " when `contractStatus === "cancelled"`, so one existing
  // call is the entire change. Run AFTER the commit and deliberately not
  // awaited into the result: per spec §4.2 Google work never throws and never
  // blocks the business write — a failed retitle leaves `calendarCreated`
  // alone and the existing "Evento en Google Calendar" retry row repairs it.
  if (outcome.calendarEventId) {
    await upsertContractCalendarEvent(data.contractId);
  }

  // The detail page (pill + reason + the now-hidden payment controls), the
  // list's "Cancelados" filter, and the Q6 presentation-only indicators in
  // Reportes and Calendario all read `contractStatus`.
  revalidatePath(`/contratos/${data.contractId}`);
  revalidatePath("/contratos");
  revalidatePath("/calendario");
  revalidatePath("/reportes");

  return { success: true };
}
