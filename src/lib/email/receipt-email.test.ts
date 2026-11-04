import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real `.env` (with a live RESEND_API_KEY) is loaded into this process:
// the `resend` module is replaced wholesale so no test can reach Resend.
const { sendMock, constructed } = vi.hoisted(() => ({ sendMock: vi.fn(), constructed: { count: 0 } }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor() {
      constructed.count += 1;
    }
  },
}));

import { sendReceiptEmailMessage } from "@/lib/email/receipt-email";
import type { ReceiptSnapshot } from "@/lib/payment-receipt/snapshot";

const ENV_KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_RECEIPT_TEMPLATE_ID"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

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
  totalPaidCents: 500_000,
  balanceCents: 1_500_000,
  paymentStatus: "deposit_paid",
  recordedByName: "Ana Pérez",
};
const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "Pruebas <pruebas@example.com>";
  process.env.RESEND_RECEIPT_TEMPLATE_ID = "payment-receipt-1";
  sendMock.mockReset();
  constructed.count = 0;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe("sendReceiptEmailMessage", () => {
  it("sends the receipt template with text-only variables and the JPEG attached", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });

    expect(await sendReceiptEmailMessage({ to: "cliente@example.com", snapshot, image })).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith({
      from: "Pruebas <pruebas@example.com>",
      to: "cliente@example.com",
      template: {
        id: "payment-receipt-1",
        variables: {
          CLIENT_NAME: "María López García",
          PAYMENT_FOLIO: "PG-0007",
          AMOUNT: "$5,000.00",
          BALANCE: "$15,000.00",
        },
      },
      attachments: [{ filename: "ComprobantePG-0007.jpg", content: image, contentType: "image/jpeg" }],
    });
  });

  it("sends BALANCE as 'Liquidado' once nothing is owed", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-2" }, error: null });
    await sendReceiptEmailMessage({
      to: "cliente@example.com",
      snapshot: { ...snapshot, balanceCents: 0, paymentStatus: "paid_in_full" },
      image,
    });
    expect(sendMock.mock.calls[0]?.[0].template.variables.BALANCE).toBe("Liquidado");
  });

  it("fails softly without building a Resend client when the template id is not configured", async () => {
    delete process.env.RESEND_RECEIPT_TEMPLATE_ID;
    expect(await sendReceiptEmailMessage({ to: "cliente@example.com", snapshot, image })).toEqual({
      ok: false,
      message: "Falta configurar RESEND_RECEIPT_TEMPLATE_ID para enviar el comprobante por correo.",
    });
    expect(constructed.count).toBe(0);
  });

  it("returns Resend's own error as the step failure", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "Template not found" } });
    expect(await sendReceiptEmailMessage({ to: "cliente@example.com", snapshot, image })).toEqual({
      ok: false,
      message: "No se pudo enviar el comprobante por correo: Template not found",
    });
  });
});
