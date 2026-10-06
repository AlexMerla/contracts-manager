"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { requireRole, scopeToOwner } from "@/lib/authorization";
import { nextPaymentFolio } from "@/lib/payments/folio";
import { resolvePaymentStatus } from "@/lib/payments/status";
import { prisma } from "@/lib/prisma";
import { Prisma, type PaymentStatus } from "@/generated/prisma/client";

import {
  addNoteSchema,
  registerPaymentSchema,
  type AddNoteValues,
  type RegisterPaymentValues,
} from "./schema";

// Spec §5: registering a payment or a note is allowed for both roles, scoped
// to the user's own contracts — same minimum as contract creation
// (src/app/(app)/contratos/actions.ts's requireSession).
async function requireSession() {
  const session = await auth();
  return requireRole(session, "normal");
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
