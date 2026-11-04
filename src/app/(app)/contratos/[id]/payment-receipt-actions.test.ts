import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// payment-receipt — real-DB integration (project pattern: no Prisma mocks).
// The `payments.receipt_*` columns come from migration
// 20261102180000_add_payment_receipt. Until it is applied to the database in
// DATABASE_URL, this whole suite SKIPS itself (probe below) instead of
// failing; it switches on by itself afterwards. Delivery is mocked — no test
// may reach Resend or ManyChat — so what is exercised here is the snapshot
// written in registerPayment's transaction, the scoping of resend/download,
// and the cancelled rules.
const { mockAuth, mockRunDelivery, mockSendReceipt } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockRunDelivery: vi.fn(),
  mockSendReceipt: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/payment-receipt/delivery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment-receipt/delivery")>()),
  runPaymentReceiptDelivery: mockRunDelivery,
  sendPaymentReceipt: mockSendReceipt,
}));

import { GET as downloadReceipt } from "@/app/(app)/contratos/[id]/pagos/[paymentId]/comprobante/route";
import { registerPayment, resendPaymentReceipt } from "@/app/(app)/contratos/[id]/actions";
import { GET as publicReceiptImage } from "@/app/comprobantes/view/[receiptToken]/image/route";
import { parseReceiptSnapshot } from "@/lib/payment-receipt/snapshot";
import { prisma } from "@/lib/prisma";

const probe = await prisma.$queryRaw<{ n: number }[]>`
  SELECT count(*)::int AS n FROM information_schema.columns
  WHERE table_name = 'payments' AND column_name = 'receipt_token'`;
const hasReceiptColumns = (probe[0]?.n ?? 0) > 0;

const ownerUserId = randomUUID();
const otherUserId = randomUUID();
const priceListId = randomUUID();

function sessionFor(id: string, name: string) {
  return {
    user: { id, role: "normal" as const, name, email: `${id}@example.com` },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}
const ownerSession = sessionFor(ownerUserId, "Ana Pérez");
const otherSession = sessionFor(otherUserId, "Otro Usuario");

const createdContractIds: string[] = [];

async function createContract(options: { total: number; deposit: number; contractStatus?: "confirmed" | "cancelled" }) {
  const contract = await prisma.contract.create({
    data: {
      folio: `CT-TEST-${randomUUID().slice(0, 8)}`,
      clientName: "Cliente de prueba (comprobantes)",
      clientEmail: "cliente@example.com",
      clientMobile: "8112345678",
      eventType: "wedding",
      eventDate: new Date("2027-08-20T00:00:00.000Z"),
      subtotal: options.total,
      total: options.total,
      deposit: options.deposit,
      balance: options.total - options.deposit,
      viewerToken: randomUUID(),
      priceListId,
      createdById: ownerUserId,
      ...(options.contractStatus ? { contractStatus: options.contractStatus } : {}),
    },
  });
  createdContractIds.push(contract.id);
  return contract;
}

function paymentInput(contractId: string, amount: number, sendReceipt: boolean) {
  return {
    contractId,
    amount,
    method: "bank_transfer" as const,
    concept: "installment" as const,
    paymentDate: "2026-11-01",
    note: "  Ref 1234  ",
    sendReceipt,
  };
}

async function register(contractId: string, amount: number, sendReceipt = false) {
  const result = await registerPayment(paymentInput(contractId, amount, sendReceipt));
  if (!("success" in result)) {
    throw new Error(`registerPayment failed: ${result.error}`);
  }
  return result;
}

describe.runIf(hasReceiptColumns)("payment receipts (real DB)", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: ownerUserId, name: "Ana Pérez", email: `${ownerUserId}@example.com`, passwordHash: "x", role: "normal" },
        { id: otherUserId, name: "Otro", email: `${otherUserId}@example.com`, passwordHash: "x", role: "normal" },
      ],
    });
    await prisma.priceList.create({ data: { id: priceListId, name: "Throwaway (comprobantes)" } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { contractId: { in: createdContractIds } } });
    await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(ownerSession);
    mockRunDelivery.mockResolvedValue([]);
    mockSendReceipt.mockResolvedValue({ ok: true });
  });

  it("writes the frozen snapshot and a 256-bit token in the registering transaction", async () => {
    const contract = await createContract({ total: 20_000, deposit: 4_000 });
    await register(contract.id, 4_000);
    const second = await register(contract.id, 8_000);

    const row = await prisma.payment.findUniqueOrThrow({ where: { id: second.paymentId } });
    expect(row.receiptToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.receiptEmailSent).toBe(false);
    expect(row.receiptWhatsappSent).toBe(false);
    expect(parseReceiptSnapshot(row.receiptSnapshot)).toMatchObject({
      v: 1,
      paymentFolio: second.folio,
      contractFolio: contract.folio,
      clientName: "Cliente de prueba (comprobantes)",
      eventType: "wedding",
      eventDate: "2027-08-20",
      amountCents: 800_000,
      method: "bank_transfer",
      concept: "installment",
      paymentDate: "2026-11-01",
      note: "Ref 1234",
      contractTotalCents: 2_000_000,
      totalPaidCents: 1_200_000,
      balanceCents: 800_000,
      paymentStatus: "partial",
      recordedByName: "Ana Pérez",
    });
  });

  // R1 "numbers survive later changes".
  it("keeps a receipt's numbers after a later payment and an edit of the contract", async () => {
    const contract = await createContract({ total: 20_000, deposit: 5_000 });
    const first = await register(contract.id, 5_000);
    const before = (await prisma.payment.findUniqueOrThrow({ where: { id: first.paymentId } })).receiptSnapshot;

    await register(contract.id, 3_000);
    await prisma.contract.update({ where: { id: contract.id }, data: { total: 30_000, clientName: "Otro nombre" } });

    const after = (await prisma.payment.findUniqueOrThrow({ where: { id: first.paymentId } })).receiptSnapshot;
    expect(after).toEqual(before);
    expect(parseReceiptSnapshot(after)).toMatchObject({ amountCents: 500_000, balanceCents: 1_500_000 });
  });

  // R2: unchecked sends nothing; checked runs delivery after commit and the
  // failures come back without failing the payment.
  it("runs delivery only when 'Enviar comprobante' is checked, and never fails the payment", async () => {
    const contract = await createContract({ total: 10_000, deposit: 1_000 });

    const unchecked = await register(contract.id, 1_000, false);
    expect(unchecked.receiptFailures).toBeNull();
    expect(mockRunDelivery).not.toHaveBeenCalled();

    mockRunDelivery.mockResolvedValueOnce([{ channel: "email", message: "Resend caído" }]);
    const checked = await register(contract.id, 1_000, true);
    expect(mockRunDelivery).toHaveBeenCalledWith(checked.paymentId);
    expect(checked.receiptFailures).toEqual([{ channel: "email", message: "Resend caído" }]);
    expect(await prisma.payment.count({ where: { contractId: contract.id } })).toBe(2);
  });

  it("resendPaymentReceipt re-runs only the chosen channel for the owner", async () => {
    const contract = await createContract({ total: 10_000, deposit: 1_000 });
    const payment = await register(contract.id, 1_000);

    expect(await resendPaymentReceipt({ paymentId: payment.paymentId, channel: "whatsapp" })).toEqual({
      success: true,
    });
    expect(mockSendReceipt).toHaveBeenCalledTimes(1);
    expect(mockSendReceipt).toHaveBeenCalledWith(payment.paymentId, "whatsapp");
  });

  it("resendPaymentReceipt answers another user exactly like a missing payment", async () => {
    const contract = await createContract({ total: 10_000, deposit: 1_000 });
    const payment = await register(contract.id, 1_000);

    mockAuth.mockResolvedValue(otherSession);
    expect(await resendPaymentReceipt({ paymentId: payment.paymentId, channel: "email" })).toEqual({
      error: "No se encontró el pago.",
    });
    expect(await resendPaymentReceipt({ paymentId: randomUUID(), channel: "email" })).toEqual({
      error: "No se encontró el pago.",
    });
    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  // R7 "cancelled resend".
  it("refuses to resend for a cancelled contract before any external call", async () => {
    const contract = await createContract({ total: 10_000, deposit: 1_000 });
    const payment = await register(contract.id, 1_000);
    await prisma.contract.update({ where: { id: contract.id }, data: { contractStatus: "cancelled" } });

    expect(await resendPaymentReceipt({ paymentId: payment.paymentId, channel: "email" })).toEqual({
      error: "El contrato está cancelado; no se envía al cliente.",
    });
    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  // R6 (real scopeToOwner) + R5 cancelled on the public route.
  it("lets the owner download a cancelled contract's receipt, hides it from others and from the public", async () => {
    const contract = await createContract({ total: 10_000, deposit: 1_000 });
    const payment = await register(contract.id, 1_000);
    await prisma.contract.update({ where: { id: contract.id }, data: { contractStatus: "cancelled" } });
    const { receiptToken } = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    const download = () =>
      downloadReceipt(new Request("https://example.com/x"), {
        params: Promise.resolve({ id: contract.id, paymentId: payment.paymentId }),
      });

    const ownerResponse = await download();
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.headers.get("content-type")).toBe("image/jpeg");

    mockAuth.mockResolvedValue(otherSession);
    expect((await download()).status).toBe(404);

    const publicResponse = await publicReceiptImage(new Request("https://example.com/x"), {
      params: Promise.resolve({ receiptToken }),
    });
    expect(publicResponse.status).toBe(404);
  });
});
