import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real database, no Prisma mocks — same established pattern as
// src/app/(app)/contratos/contratos-actions.test.ts. `auth()` is mocked so
// `requireSession`'s gate resolves to a real, existing user row (`createdById`
// / `recordedById` are real FKs to `users`).
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

// `revalidatePath` throws "static generation store missing" outside a real
// Next.js request/render lifecycle — same stub as contratos-actions.test.ts.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { addNote, registerPayment } from "@/app/(app)/contratos/[id]/actions";

const ownerUserId = randomUUID();
const otherUserId = randomUUID();
const priceListId = randomUUID();

const ownerSession = {
  user: { id: ownerUserId, role: "normal" as const, name: "Owner", email: "payments-owner@example.com" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};
const otherSession = {
  user: { id: otherUserId, role: "normal" as const, name: "Other", email: "payments-other@example.com" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const createdContractIds: string[] = [];

// Gotcha confirmed against src/app/(app)/contratos/contratos-actions.test.ts
// and src/lib/contracts/folio.ts: any throwaway contract fixture MUST use the
// `CT-` prefix. `nextFolio`'s "highest folio" lookup excludes `CT-`-prefixed
// folios entirely, but a fixture using some OTHER non-numeric prefix (e.g.
// `TEST-`) would win the lexicographic `ORDER BY folio DESC` (letters sort
// above digits) and make `Number(folio) + 1` evaluate to `NaN`, corrupting
// every contract created afterward (including by other suites run in the
// same process) with a folio literally named `"00NaN"`.
function throwawayFolio(): string {
  return `CT-TEST-${randomUUID().slice(0, 8)}`;
}

async function createThrowawayContract(options: {
  deposit: number;
  total: number;
  contractStatus?: "pre_contract" | "confirmed" | "completed" | "cancelled";
  createdById?: string;
}) {
  const subtotal = options.total;
  const contract = await prisma.contract.create({
    data: {
      folio: throwawayFolio(),
      clientName: "Cliente de prueba (pagos)",
      eventType: "wedding",
      eventDate: new Date("2027-08-20T00:00:00.000Z"),
      subtotal,
      total: options.total,
      deposit: options.deposit,
      balance: options.total - options.deposit,
      viewerToken: randomUUID(),
      priceListId,
      createdById: options.createdById ?? ownerUserId,
      ...(options.contractStatus ? { contractStatus: options.contractStatus } : {}),
    },
  });
  createdContractIds.push(contract.id);
  return contract;
}

async function cleanupCreatedContracts() {
  if (createdContractIds.length === 0) {
    return;
  }
  await prisma.payment.deleteMany({ where: { contractId: { in: createdContractIds } } });
  await prisma.note.deleteMany({ where: { contractId: { in: createdContractIds } } });
  await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
  createdContractIds.length = 0;
}

describe("registerPayment / addNote", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(ownerSession);
  });

  beforeAll(async () => {
    mockAuth.mockResolvedValue(ownerSession);

    await prisma.user.createMany({
      data: [
        {
          id: ownerUserId,
          name: "Throwaway Payments Owner",
          email: "payments-owner@example.com",
          passwordHash: "unused-in-this-test",
          role: "normal",
        },
        {
          id: otherUserId,
          name: "Throwaway Payments Other",
          email: "payments-other@example.com",
          passwordHash: "unused-in-this-test",
          role: "normal",
        },
      ],
    });

    await prisma.priceList.create({
      data: { id: priceListId, name: "Throwaway price list (payments)", isDefault: false, active: true },
    });
  });

  afterAll(async () => {
    await cleanupCreatedContracts();
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } });
  });

  // Spec: "Valid payment gets a consecutive folio" — the sequence is global
  // across contracts, not per-contract (nextPaymentFolio has no `WHERE
  // contractId = ...`), mirroring nextFolio's own contract-wide sequence.
  it("assigns consecutive PG-#### folios across different contracts", async () => {
    const contractA = await createThrowawayContract({ deposit: 1000, total: 5000 });
    const contractB = await createThrowawayContract({ deposit: 1000, total: 5000 });

    const first = await registerPayment({
      contractId: contractA.id,
      amount: 100,
      method: "cash",
      concept: "deposit",
      paymentDate: "2027-01-01",
      note: "",
    });
    const second = await registerPayment({
      contractId: contractB.id,
      amount: 100,
      method: "cash",
      concept: "deposit",
      paymentDate: "2027-01-02",
      note: "",
    });

    expect("success" in first && first.success).toBe(true);
    expect("success" in second && second.success).toBe(true);
    const folioA = (first as Extract<typeof first, { success: true }>).folio;
    const folioB = (second as Extract<typeof second, { success: true }>).folio;

    expect(folioA).toMatch(/^PG-\d{4}$/);
    expect(folioB).toMatch(/^PG-\d{4}$/);
    expect(Number(folioB.slice(3))).toBe(Number(folioA.slice(3)) + 1);
  });

  // Spec: the full pending -> deposit_paid -> partial -> paid_in_full
  // sequence, with the pre_contract -> confirmed transition firing exactly
  // once (on the payment that first crosses the deposit, never again on a
  // later payment).
  it("drives pending -> deposit_paid -> partial -> paid_in_full with a one-shot contract confirmation", async () => {
    const contract = await createThrowawayContract({ deposit: 1000, total: 5000 });
    expect(contract.contractStatus).toBe("pre_contract");
    expect(contract.paymentStatus).toBe("pending");

    // Payment 1: crosses the deposit exactly (cumulative 1000 >= 1000).
    const first = await registerPayment({
      contractId: contract.id,
      amount: 1000,
      method: "cash",
      concept: "deposit",
      paymentDate: "2027-01-01",
      note: "",
    });
    expect("success" in first && first.success).toBe(true);

    const afterFirst = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(afterFirst.paymentStatus).toBe("deposit_paid");
    expect(afterFirst.contractStatus).toBe("confirmed");

    // Payment 2: cumulative 3000 of 5000 — partial, contract stays confirmed
    // (not re-flipped, not reverted).
    const second = await registerPayment({
      contractId: contract.id,
      amount: 2000,
      method: "bank_transfer",
      concept: "installment",
      paymentDate: "2027-02-01",
      note: "Segundo abono",
    });
    expect("success" in second && second.success).toBe(true);

    const afterSecond = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(afterSecond.paymentStatus).toBe("partial");
    expect(afterSecond.contractStatus).toBe("confirmed");

    // Payment 3: cumulative 5000 of 5000 — paid in full.
    const third = await registerPayment({
      contractId: contract.id,
      amount: 2000,
      method: "card",
      concept: "settlement",
      paymentDate: "2027-03-01",
      note: "",
    });
    expect("success" in third && third.success).toBe(true);

    const afterThird = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(afterThird.paymentStatus).toBe("paid_in_full");
    expect(afterThird.contractStatus).toBe("confirmed");

    // Snapshot immutability (spec "Live Balance Derivation" /
    // frozen-snapshot regression): total/deposit/balance are never rewritten
    // by registerPayment, regardless of how many payments were registered.
    expect(Number(afterThird.total)).toBe(5000);
    expect(Number(afterThird.deposit)).toBe(1000);
    expect(Number(afterThird.balance)).toBe(4000);

    const payments = await prisma.payment.findMany({ where: { contractId: contract.id } });
    expect(payments).toHaveLength(3);
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    expect(totalPaid).toBe(5000);
  });

  // SUPERSEDES the sprint-08 test "recomputes paymentStatus but never
  // re-confirms a cancelled contract", which asserted this call SUCCEEDS.
  // Resolved Q3 of the contract-cancellation change reversed that rule: a
  // cancelled contract now accepts no further payments at all, so there is
  // no paymentStatus to recompute. The `contractStatus === "pre_contract"`
  // gate on the confirm flip still stands for `completed` contracts, which
  // the next test covers.
  it("rejects a payment on a cancelled contract and writes nothing", async () => {
    const contract = await createThrowawayContract({
      deposit: 1000,
      total: 5000,
      contractStatus: "cancelled",
    });

    const result = await registerPayment({
      contractId: contract.id,
      amount: 1000,
      method: "cash",
      concept: "deposit",
      paymentDate: "2027-01-01",
      note: "",
    });
    expect(result).toEqual({
      error: "El contrato está cancelado. No se pueden registrar más pagos.",
    });

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.paymentStatus).toBe("pending");
    expect(after.contractStatus).toBe("cancelled");

    const payments = await prisma.payment.findMany({ where: { contractId: contract.id } });
    expect(payments).toHaveLength(0);
  });

  // The surviving half of the superseded test: `completed` is the other
  // non-`pre_contract` status, and it must still accept a payment while
  // never being resurrected to "confirmed".
  it("recomputes paymentStatus but never re-confirms a completed contract", async () => {
    const contract = await createThrowawayContract({
      deposit: 1000,
      total: 5000,
      contractStatus: "completed",
    });

    const result = await registerPayment({
      contractId: contract.id,
      amount: 1000,
      method: "cash",
      concept: "deposit",
      paymentDate: "2027-01-01",
      note: "",
    });
    expect("success" in result && result.success).toBe(true);

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.paymentStatus).toBe("deposit_paid");
    expect(after.contractStatus).toBe("completed");
  });

  // Spec: overpayment is accepted (not rejected) and resolves to
  // paid_in_full — display-side clamping is page.tsx's job, not the action's.
  it("accepts an overpayment and marks the contract paid in full", async () => {
    const contract = await createThrowawayContract({ deposit: 1000, total: 5000 });

    const result = await registerPayment({
      contractId: contract.id,
      amount: 6000,
      method: "cash",
      concept: "settlement",
      paymentDate: "2027-01-01",
      note: "",
    });
    expect("success" in result && result.success).toBe(true);

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.paymentStatus).toBe("paid_in_full");
    expect(Number(after.total)).toBe(5000);
  });

  // Spec: "Failed insert leaves status untouched" — proxied here via a
  // validation failure (zod rejects before the transaction ever opens),
  // since reliably forcing the real `P2002` folio-collision path would
  // require mocking Prisma's write layer, which this suite deliberately
  // avoids (see the file header).
  it("leaves paymentStatus/contractStatus untouched when the input is invalid", async () => {
    const contract = await createThrowawayContract({ deposit: 1000, total: 5000 });

    const result = await registerPayment({
      contractId: contract.id,
      amount: -100,
      method: "cash",
      concept: "deposit",
      paymentDate: "2027-01-01",
      note: "",
    });
    expect("error" in result).toBe(true);

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.paymentStatus).toBe("pending");
    expect(after.contractStatus).toBe("pre_contract");

    const payments = await prisma.payment.findMany({ where: { contractId: contract.id } });
    expect(payments).toHaveLength(0);
  });

  // Spec §5 — Payments Authorization Scoping: a `normal` user must not be
  // able to register a payment on (or even detect the existence of) a
  // contract created by another user.
  it("rejects a non-owning session as if the contract does not exist, and writes nothing", async () => {
    const contract = await createThrowawayContract({ deposit: 1000, total: 5000 });

    mockAuth.mockResolvedValueOnce(otherSession);
    const result = await registerPayment({
      contractId: contract.id,
      amount: 1000,
      method: "cash",
      concept: "deposit",
      paymentDate: "2027-01-01",
      note: "",
    });
    expect(result).toEqual({ error: "Contrato no encontrado." });

    const payments = await prisma.payment.findMany({ where: { contractId: contract.id } });
    expect(payments).toHaveLength(0);
  });

  // Spec: "Valid note saved with its author".
  it("addNote saves a trimmed note linked to the contract and the session's author", async () => {
    const contract = await createThrowawayContract({ deposit: 1000, total: 5000 });

    const result = await addNote({ contractId: contract.id, text: "  Confirmó por WhatsApp.  " });
    expect("success" in result && result.success).toBe(true);
    const { noteId } = result as Extract<typeof result, { success: true }>;

    const note = await prisma.note.findUniqueOrThrow({ where: { id: noteId } });
    expect(note.text).toBe("Confirmó por WhatsApp.");
    expect(note.contractId).toBe(contract.id);
    expect(note.userId).toBe(ownerUserId);
  });

  it("addNote rejects an empty (or whitespace-only) note", async () => {
    const contract = await createThrowawayContract({ deposit: 1000, total: 5000 });

    const result = await addNote({ contractId: contract.id, text: "   " });
    expect("error" in result).toBe(true);

    const notes = await prisma.note.findMany({ where: { contractId: contract.id } });
    expect(notes).toHaveLength(0);
  });

  // Spec §5 — Notes Authorization Scoping, same rule as payments.
  it("addNote rejects a non-owning session as if the contract does not exist", async () => {
    const contract = await createThrowawayContract({ deposit: 1000, total: 5000 });

    mockAuth.mockResolvedValueOnce(otherSession);
    const result = await addNote({ contractId: contract.id, text: "Nota de otro usuario." });
    expect(result).toEqual({ error: "Contrato no encontrado." });

    const notes = await prisma.note.findMany({ where: { contractId: contract.id } });
    expect(notes).toHaveLength(0);
  });
});
