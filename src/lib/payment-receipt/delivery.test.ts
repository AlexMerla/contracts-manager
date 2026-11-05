import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unit test of the receipt delivery steps: Prisma, both transports and the
// renderer are mocked (the new `payments` columns don't exist on the shared
// DB until the migration is applied; the DB-backed coverage lives in
// src/app/(app)/contratos/[id]/payment-receipt-actions.test.ts and switches
// itself on once they do).
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  sendEmail: vi.fn(),
  sendWhatsApp: vi.fn(),
  render: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { payment: { findUnique: mocks.findUnique, update: mocks.update } },
}));
vi.mock("@/lib/email/receipt-email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/receipt-email")>()),
  sendReceiptEmailMessage: mocks.sendEmail,
}));
// The HighLevel exchange itself is covered in
// src/lib/whatsapp/highlevel-whatsapp.test.ts (mocked fetch).
vi.mock("@/lib/whatsapp/highlevel-whatsapp", () => ({ sendReceiptWhatsAppMessage: mocks.sendWhatsApp }));
vi.mock("./generate-receipt-image", () => ({ generateReceiptImage: mocks.render }));

import { runPaymentReceiptDelivery, sendPaymentReceipt } from "./delivery";

import type { ReceiptSnapshot } from "./snapshot";

const PAYMENT_ID = "5b0c2a52-7f0e-4c43-9a3d-1d8f3b0c9e11";
const TOKEN = "tok_ABCdef-0123456789abcdefghijklmnopqrstu";

const snapshot: ReceiptSnapshot = {
  v: 1,
  issuedAt: "2026-11-02T18:30:00.000Z",
  paymentFolio: "PG-0007",
  contractFolio: "03142",
  clientName: "María López García",
  eventType: "wedding",
  eventDate: "2027-02-14",
  amountCents: 500_000,
  method: "cash",
  concept: "deposit",
  paymentDate: "2026-11-01",
  note: null,
  contractTotalCents: 2_000_000,
  totalPaidCents: 1_200_000,
  balanceCents: 800_000,
  paymentStatus: "partial",
  recordedByName: "Ana Pérez",
};

function paymentRow(overrides: { contractStatus?: string; clientEmail?: string | null; clientMobile?: string | null; receiptSnapshot?: unknown } = {}) {
  return {
    receiptToken: TOKEN,
    receiptSnapshot: "receiptSnapshot" in overrides ? overrides.receiptSnapshot : snapshot,
    contract: {
      contractStatus: overrides.contractStatus ?? "confirmed",
      clientEmail: "clientEmail" in overrides ? overrides.clientEmail : "cliente@example.com",
      clientMobile: "clientMobile" in overrides ? overrides.clientMobile : "8112345678",
    },
  };
}

const originalBaseUrl = process.env.APP_BASE_URL;
const image = Buffer.from([0xff, 0xd8, 0xff]);

beforeEach(() => {
  process.env.APP_BASE_URL = "https://contratos.ejemplo.com";
  mocks.render.mockResolvedValue(image);
  mocks.sendEmail.mockResolvedValue({ ok: true });
  mocks.sendWhatsApp.mockResolvedValue({ ok: true });
  mocks.update.mockResolvedValue({});
  mocks.findUnique.mockResolvedValue(paymentRow());
});

afterEach(() => {
  vi.clearAllMocks();
  if (originalBaseUrl === undefined) {
    delete process.env.APP_BASE_URL;
  } else {
    process.env.APP_BASE_URL = originalBaseUrl;
  }
});

describe("sendPaymentReceipt", () => {
  it("emails the rendered snapshot and flips receipt_email_sent", async () => {
    expect(await sendPaymentReceipt(PAYMENT_ID, "email")).toEqual({ ok: true });
    expect(mocks.render).toHaveBeenCalledWith(snapshot);
    expect(mocks.sendEmail).toHaveBeenCalledWith({ to: "cliente@example.com", snapshot, image });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: PAYMENT_ID }, data: { receiptEmailSent: true } });
  });

  // R4: the link is built from the token, never the internal id.
  it("sends WhatsApp the public token URL and the snapshot's payment folio, amount and balance, then flips receipt_whatsapp_sent", async () => {
    expect(await sendPaymentReceipt(PAYMENT_ID, "whatsapp")).toEqual({ ok: true });
    const [message] = mocks.sendWhatsApp.mock.calls[0] ?? [];
    expect(message).toEqual({
      phone: "8112345678",
      clientName: "María López García",
      paymentFolio: "PG-0007",
      amountCents: 500_000,
      balanceCents: 800_000,
      receiptUrl: `https://contratos.ejemplo.com/comprobantes/view/${TOKEN}`,
    });
    expect(message.receiptUrl).not.toContain(PAYMENT_ID);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: PAYMENT_ID }, data: { receiptWhatsappSent: true } });
  });

  // R7: refused before any rendering, configuration or external call.
  it("refuses a cancelled contract on both channels without touching anything", async () => {
    mocks.findUnique.mockResolvedValue(paymentRow({ contractStatus: "cancelled" }));
    for (const channel of ["email", "whatsapp"] as const) {
      expect(await sendPaymentReceipt(PAYMENT_ID, channel)).toEqual({
        ok: false,
        message: "El contrato está cancelado; no se envía al cliente.",
      });
    }
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("skips a channel whose contact datum is missing, leaving its flag false", async () => {
    mocks.findUnique.mockResolvedValue(paymentRow({ clientEmail: null, clientMobile: null }));
    // The mobile guard lives in sendReceiptWhatsAppMessage (before any call).
    mocks.sendWhatsApp.mockResolvedValue({
      ok: false,
      message: "El cliente no tiene un celular válido para WhatsApp.",
    });
    expect(await sendPaymentReceipt(PAYMENT_ID, "email")).toEqual({ ok: false, message: "El cliente no tiene correo." });
    expect(await sendPaymentReceipt(PAYMENT_ID, "whatsapp")).toEqual({
      ok: false,
      message: "El cliente no tiene un celular válido para WhatsApp.",
    });
    expect(mocks.sendWhatsApp.mock.calls[0]?.[0]).toMatchObject({ phone: null });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses a payment that predates receipts and an unknown payment", async () => {
    mocks.findUnique.mockResolvedValueOnce(paymentRow({ receiptSnapshot: null }));
    expect(await sendPaymentReceipt(PAYMENT_ID, "email")).toEqual({
      ok: false,
      message: "Este pago se registró antes de los comprobantes; no tiene comprobante.",
    });
    mocks.findUnique.mockResolvedValueOnce(null);
    expect(await sendPaymentReceipt(PAYMENT_ID, "email")).toEqual({ ok: false, message: "No se encontró el pago." });
  });

  it("does not flip the flag when the transport fails", async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, message: "No se pudo enviar el comprobante por correo: boom" });
    expect(await sendPaymentReceipt(PAYMENT_ID, "email")).toEqual({
      ok: false,
      message: "No se pudo enviar el comprobante por correo: boom",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports a render failure with the spec's message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.render.mockRejectedValue(new Error("disk"));
    expect(await sendPaymentReceipt(PAYMENT_ID, "email")).toEqual({
      ok: false,
      message: "No se pudo generar el comprobante.",
    });
  });

  it("never throws, even when the database does", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findUnique.mockRejectedValue(new Error("connection reset"));
    await expect(sendPaymentReceipt(PAYMENT_ID, "whatsapp")).resolves.toEqual({
      ok: false,
      message: "No se pudo enviar el comprobante por WhatsApp: connection reset",
    });
  });
});

describe("runPaymentReceiptDelivery", () => {
  it("returns no failures when both channels succeed, email first", async () => {
    expect(await runPaymentReceiptDelivery(PAYMENT_ID)).toEqual([]);
    expect(mocks.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendWhatsApp.mock.invocationCallOrder[0] ?? 0
    );
  });

  // R2 "a step fails": WhatsApp still runs and the failure is reported.
  it("still sends WhatsApp when email fails, and reports only the failed channel", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendEmail.mockResolvedValue({ ok: false, message: "Resend caído" });
    expect(await runPaymentReceiptDelivery(PAYMENT_ID)).toEqual([{ channel: "email", message: "Resend caído" }]);
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: PAYMENT_ID }, data: { receiptWhatsappSent: true } });
  });
});

// highlevel-whatsapp S3.4: a HighLevel failure leaves the flag false and
// never fails the payment.
describe("receipt WhatsApp through HighLevel", () => {
  it("reports a 429 as a WhatsApp failure without flipping its flag", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const message = "HighLevel limitó las solicitudes; intente de nuevo en unos minutos.";
    mocks.sendWhatsApp.mockResolvedValue({ ok: false, message });
    expect(await runPaymentReceiptDelivery(PAYMENT_ID)).toEqual([{ channel: "whatsapp", message }]);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: PAYMENT_ID }, data: { receiptEmailSent: true } });
  });
});
