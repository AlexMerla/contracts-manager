"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { requireRole, scopeToOwner } from "@/lib/authorization";
import { formatMoney } from "@/lib/contract-template/format-money";
import {
  CONTRACT_EDIT_BLOCK_MESSAGE,
  contractEditBlock,
  describeContractEditChanges,
  toCentsOrNull,
  type EditableContractState,
} from "@/lib/contracts/contract-edit";
import { runContractEditPipeline } from "@/lib/contracts/delivery-pipeline";
import { priceOrder, type PriceOrderFailure } from "@/lib/contracts/price-order";
import { todayInAppTimeZone } from "@/lib/dates";
import { upsertContractCalendarEvent } from "@/lib/google/calendar";
import {
  RECEIPT_CANCELLED_MESSAGE,
  RECEIPT_NOT_FOUND_MESSAGE,
  runPaymentReceiptDelivery,
  sendPaymentReceipt,
  type ReceiptDeliveryFailure,
} from "@/lib/payment-receipt/delivery";
import { buildReceiptSnapshot, toCents } from "@/lib/payment-receipt/snapshot";
import { generateReceiptToken } from "@/lib/payment-receipt/token";
import { isFolioCollision } from "@/lib/contracts/folio";
import { nextPaymentFolio } from "@/lib/payments/folio";
import { recomputePaymentStatusOnEdit, resolvePaymentStatus } from "@/lib/payments/status";
import { prisma } from "@/lib/prisma";
import {
  Prisma,
  type ContractStatus,
  type EventType,
  type PaymentStatus,
} from "@/generated/prisma/client";

import {
  updateContractPayloadSchema,
  type UpdateContractPayload,
} from "../nuevo/schema";

import {
  addNoteSchema,
  cancelContractSchema,
  registerPaymentSchema,
  resendPaymentReceiptSchema,
  type AddNoteValues,
  type CancelContractValues,
  type RegisterPaymentValues,
  type ResendPaymentReceiptValues,
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
  // payment-receipt: read under the same lock so the snapshot prints the
  // contract exactly as it is at the instant this payment commits.
  folio: string;
  clientName: string;
  eventType: EventType;
  eventDate: Date;
}

export type RegisterPaymentResult =
  | { error: string }
  | {
      success: true;
      paymentId: string;
      folio: string;
      /** `null` when "Enviar comprobante" was unchecked (nothing attempted);
       * otherwise the channels that failed — empty means both went out. */
      receiptFailures: ReceiptDeliveryFailure[] | null;
    };

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
                 total,
                 folio,
                 client_name     AS "clientName",
                 event_type      AS "eventType",
                 event_date      AS "eventDate"
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

        // Live aggregate of the payments ALREADY on the contract, computed
        // INSIDE the same locked transaction — never a denormalized "paid so
        // far" column. Read before the insert so this payment's receipt
        // snapshot (which needs the cumulative total) goes in with the row
        // itself, in one write. Summed in integer cents (status.ts's float
        // reasoning).
        const { _sum } = await tx.payment.aggregate({
          where: { contractId: data.contractId },
          _sum: { amount: true },
        });
        const totalPaidCents = toCents(Number(_sum.amount ?? 0)) + toCents(data.amount);

        const nextStatus = resolvePaymentStatus({
          previousStatus: locked.paymentStatus as PaymentStatus,
          totalPaid: totalPaidCents / 100,
          deposit: Number(locked.deposit),
          total: Number(locked.total),
        });

        const paymentDate = new Date(`${data.paymentDate}T00:00:00.000Z`);
        const note = data.note.trim() || null;

        // payment-receipt R1: the frozen receipt, written in the same insert.
        // Every later render reads only this — a later payment or an edit of
        // the contract never changes what this receipt says.
        const receiptSnapshot = buildReceiptSnapshot({
          issuedAt: new Date(),
          paymentFolio: folio,
          contractFolio: locked.folio,
          clientName: locked.clientName,
          eventType: locked.eventType,
          eventDate: locked.eventDate,
          amount: data.amount,
          method: data.method,
          concept: data.concept,
          paymentDate,
          note,
          contractTotalCents: toCents(Number(locked.total)),
          totalPaidCents,
          paymentStatus: nextStatus,
          // Same snapshot-the-author's-name discipline as the cancel note.
          recordedByName: session.user.name,
        });

        const payment = await tx.payment.create({
          data: {
            contractId: data.contractId,
            folio,
            amount: data.amount,
            method: data.method,
            concept: data.concept,
            paymentDate,
            note,
            recordedById: session.user.id,
            receiptToken: generateReceiptToken(),
            receiptSnapshot,
          },
          select: { id: true, folio: true },
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

      // payment-receipt R2: AFTER the commit, never inside the lock — the
      // payment exists whatever happens next. `runPaymentReceiptDelivery`
      // never throws, so a Resend/HighLevel failure can't turn a recorded
      // payment into an error response.
      const receiptFailures = data.sendReceipt ? await runPaymentReceiptDelivery(created.id) : null;

      // Re-renders the detail page: the Pagos tab (incl. the receipt status
      // badges), the sidebar's "Cobrado $X de $Y", and the status pills.
      revalidatePath(`/contratos/${data.contractId}`);

      return { success: true, paymentId: created.id, folio: created.folio, receiptFailures };
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

export type ResendPaymentReceiptResult = { error: string } | { success: true };

/**
 * payment-receipt R7 — "Reenviar comprobante" for one payment and one channel.
 * Scoped like every sibling action: `scopeToOwner` makes another user's
 * payment indistinguishable from a missing one. A cancelled contract is
 * refused here AND inside the step itself, before any Resend/HighLevel or
 * configuration work; the flag is left untouched. Re-runs only the chosen
 * step, reusing the stored snapshot and token.
 */
export async function resendPaymentReceipt(
  input: ResendPaymentReceiptValues
): Promise<ResendPaymentReceiptResult> {
  const session = await requireSession();

  const parsed = resendPaymentReceiptSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { paymentId, channel } = parsed.data;

  const db = scopeToOwner(session);
  const payment = await db.payment.findFirst({
    where: { id: paymentId },
    select: { contractId: true, contract: { select: { contractStatus: true } } },
  });
  if (!payment) {
    return { error: RECEIPT_NOT_FOUND_MESSAGE };
  }
  if (payment.contract.contractStatus === "cancelled") {
    return { error: RECEIPT_CANCELLED_MESSAGE };
  }

  const result = await sendPaymentReceipt(paymentId, channel);
  revalidatePath(`/contratos/${payment.contractId}`);
  return result.ok ? { success: true } : { error: result.message };
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

export type UpdateContractResult =
  | { error: string }
  /** `changed: false` — identical payload: nothing written, nothing re-run. */
  | { success: true; changed: boolean };

interface LockedEditRow {
  id: string;
  contractStatus: ContractStatus;
  paymentStatus: PaymentStatus;
}

type EditTransactionOutcome = { blocked: string } | { blocked?: undefined; changed: boolean };

// Spec §8.2's copy for the shared pricing helper's failures.
function editFailureMessage(failure: PriceOrderFailure): string {
  switch (failure.kind) {
    case "duplicate_package":
      return "El pedido tiene paquetes duplicados.";
    case "missing_package":
      return "Uno o más paquetes del pedido ya no existen.";
    case "inactive_package":
    case "unpriced_package":
      return `El paquete «${failure.packageName}» no está disponible en la lista de precios de este contrato.`;
    case "over_max_quantity":
      return `«${failure.packageName}» permite máximo ${failure.maxQuantity} por contrato.`;
    case "missing_selection":
      return `Falta elegir una opción para «${failure.serviceName}» en «${failure.packageName}».`;
  }
}

function nullIfBlank(value: string): string | null {
  return value.trim() || null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function wallClockTime(time: Date | null): string | null {
  return time ? time.toISOString().slice(11, 16) : null;
}

/**
 * edit-precontract — spec §5 editing rule + §8.2. The only writer that
 * changes an EXISTING contract's lines and amounts after creation.
 *
 * Ownership is `scopeToOwner` (normal: own; super: all — so house-user
 * contracts are super-only), checked outside the transaction like every
 * sibling action. Everything else runs in ONE transaction behind the same
 * `SELECT … FOR UPDATE` row lock as `registerPayment` / `cancelContract`, so a
 * concurrent payment or cancellation serializes against the edit and the
 * editability rule is re-checked on the row as it is NOW (spec S1.6).
 *
 * Post-commit (fail-open): image → Drive overwrite in place → Calendar via
 * `runContractEditPipeline`. Never email/WhatsApp.
 */
export async function updateContract(input: UpdateContractPayload): Promise<UpdateContractResult> {
  const session = await requireSession();

  const parsed = updateContractPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  const db = scopeToOwner(session);
  const owned = await db.contract.findUnique({ where: { id: data.contractId }, select: { id: true } });
  if (!owned) {
    return { error: "Contrato no encontrado." };
  }

  let outcome: EditTransactionOutcome;
  try {
    outcome = await prisma.$transaction(async (tx): Promise<EditTransactionOutcome> => {
      const [locked] = await tx.$queryRaw<LockedEditRow[]>(Prisma.sql`
        SELECT id,
               contract_status AS "contractStatus",
               payment_status  AS "paymentStatus"
        FROM contracts
        WHERE id = ${data.contractId}
        FOR UPDATE
      `);
      if (!locked) {
        throw new ContractRowNotFoundError();
      }

      const block = contractEditBlock(locked.contractStatus, locked.paymentStatus);
      if (block) {
        return { blocked: CONTRACT_EDIT_BLOCK_MESSAGE[block] };
      }

      // Read AFTER the lock is held: a concurrent edit has fully committed by
      // now, so these are the lines/selections the new ones are matched to.
      const current = await tx.contract.findUniqueOrThrow({
        where: { id: data.contractId },
        include: { contractPackages: true, contractServiceSelections: true },
      });

      const priced = await priceOrder(tx, {
        priceListId: current.priceListId,
        orderLines: data.orderLines,
        serviceSelections: data.serviceSelections,
        keptLines: current.contractPackages.map((line) => ({
          packageId: line.packageId,
          nameSnapshot: line.nameSnapshot,
          priceSnapshot: Number(line.priceSnapshot),
          quantity: line.quantity,
        })),
      });
      if (!priced.ok) {
        return { blocked: editFailureMessage(priced.failure) };
      }

      const total = priced.subtotal - (data.discount ?? 0) + (data.extraCharge ?? 0);
      const totalCents = Math.round(total * 100);
      const depositCents = Math.round(data.deposit * 100);

      const { _sum } = await tx.payment.aggregate({
        where: { contractId: data.contractId },
        _sum: { amount: true },
      });
      const totalPaid = Number(_sum.amount ?? 0);

      if (totalCents < Math.round(totalPaid * 100)) {
        return {
          blocked: `El nuevo total (${formatMoney(total)}) no puede ser menor a lo ya cobrado (${formatMoney(totalPaid)}).`,
        };
      }
      // Deposit lock (spec R5): once any payment moved the status off
      // `pending`, the deposit is history, not a proposal.
      if (locked.paymentStatus !== "pending") {
        if (depositCents !== toCentsOrNull(current.deposit)) {
          return { blocked: "El anticipo ya fue cobrado y no se puede modificar." };
        }
      } else if (depositCents > totalCents) {
        return { blocked: "El anticipo no puede ser mayor al total." };
      }

      const { contractData } = data;
      const next = {
        clientName: contractData.clientName,
        clientPhone: nullIfBlank(contractData.clientPhone),
        clientMobile: nullIfBlank(contractData.clientMobile),
        clientEmail: nullIfBlank(contractData.clientEmail),
        clientAddress: nullIfBlank(contractData.clientAddress),
        eventType: contractData.eventType,
        celebrated: nullIfBlank(contractData.celebrated),
        eventDate: new Date(`${contractData.eventDate}T00:00:00.000Z`),
        eventTime: contractData.eventTime.trim()
          ? new Date(`1970-01-01T${contractData.eventTime}:00.000Z`)
          : null,
        placeName: nullIfBlank(contractData.placeName),
        placeAddress: nullIfBlank(contractData.placeAddress),
      };

      const before: EditableContractState = {
        clientName: current.clientName,
        clientPhone: current.clientPhone,
        clientMobile: current.clientMobile,
        clientEmail: current.clientEmail,
        clientAddress: current.clientAddress,
        eventType: current.eventType,
        celebrated: current.celebrated,
        eventDate: isoDate(current.eventDate),
        eventTime: wallClockTime(current.eventTime),
        placeName: current.placeName,
        placeAddress: current.placeAddress,
        lines: Object.fromEntries(current.contractPackages.map((line) => [line.packageId, line.quantity])),
        selections: Object.fromEntries(
          current.contractServiceSelections.map((selection) => [selection.serviceId, selection.selectedOption])
        ),
        discountCents: toCentsOrNull(current.discount),
        extraChargeCents: toCentsOrNull(current.extraCharge),
        depositCents: toCentsOrNull(current.deposit) ?? 0,
      };
      const after: EditableContractState = {
        ...next,
        eventDate: isoDate(next.eventDate),
        eventTime: wallClockTime(next.eventTime),
        lines: Object.fromEntries(priced.lines.map((line) => [line.packageId, line.quantity])),
        selections: Object.fromEntries(
          priced.selections.map((selection) => [selection.serviceId, selection.selectedOption])
        ),
        discountCents: toCentsOrNull(data.discount),
        extraChargeCents: toCentsOrNull(data.extraCharge),
        depositCents,
      };

      const changes = describeContractEditChanges(before, after);
      // Spec R11/S11.2: an identical payload writes nothing at all — no Note,
      // no flag reset, no regeneration.
      if (changes.length === 0) {
        return { changed: false };
      }

      const nextPaymentStatus = recomputePaymentStatusOnEdit({
        currentStatus: locked.paymentStatus,
        totalPaid,
        deposit: data.deposit,
        total,
      });
      // Same promotion rule as `registerPayment`; never a regression.
      const confirms = locked.contractStatus === "pre_contract" && nextPaymentStatus !== "pending";

      // Lines and selections are rewritten in full; kept lines carry their
      // original snapshot (priceOrder already resolved it), so nothing a
      // client agreed to is re-priced.
      await tx.contractServiceSelection.deleteMany({ where: { contractId: data.contractId } });
      await tx.contractPackage.deleteMany({ where: { contractId: data.contractId } });
      await tx.contractPackage.createMany({
        data: priced.lines.map(({ packageId, nameSnapshot, priceSnapshot, quantity }) => ({
          contractId: data.contractId,
          packageId,
          nameSnapshot,
          priceSnapshot,
          quantity,
        })),
      });
      if (priced.selections.length > 0) {
        await tx.contractServiceSelection.createMany({
          data: priced.selections.map((selection) => ({ ...selection, contractId: data.contractId })),
        });
      }

      await tx.contract.update({
        where: { id: data.contractId },
        data: {
          ...next,
          discount: data.discount,
          extraCharge: data.extraCharge,
          subtotal: priced.subtotal,
          total,
          deposit: data.deposit,
          balance: total - data.deposit,
          paymentStatus: nextPaymentStatus,
          ...(confirms ? { contractStatus: "confirmed" as const } : {}),
          // The generated image, the Drive files and the Calendar event all
          // show the OLD data now; the post-commit pipeline flips each back.
          // `emailSent` is left alone: nothing is re-sent automatically.
          imageGenerated: false,
          driveUploaded: false,
          calendarCreated: false,
        },
      });

      // Same snapshot-the-author's-name discipline as `cancelContract`.
      await tx.note.create({
        data: {
          contractId: data.contractId,
          userId: session.user.id,
          text: `Contrato editado por ${session.user.name ?? "un usuario"}: ${changes.join(", ")}`,
        },
      });

      return { changed: true };
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

  if (outcome.changed) {
    await runContractEditPipeline(data.contractId);
  }

  revalidatePath(`/contratos/${data.contractId}`);
  revalidatePath("/contratos");
  revalidatePath("/calendario");

  return { success: true, changed: outcome.changed };
}
