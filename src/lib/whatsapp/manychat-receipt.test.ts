import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendReceiptWhatsAppMessage } from "@/lib/whatsapp/manychat";

// SAFETY: same rule as manychat.test.ts — the real `.env` (with a LIVE
// ManyChat key) is loaded into this process, so `fetch` is stubbed for every
// test and the env is replaced with fake values.

const ENV_KEYS = [
  "MANYCHAT_API_KEY",
  "WHATSAPP_PHONE_FIELD_ID",
  "MANYCHAT_FIELD_RECEIPT_LINK",
  "MANYCHAT_FIELD_RECEIPT_FOLIO",
  "MANYCHAT_FIELD_RECEIPT_AMOUNT",
  "MANYCHAT_FIELD_RECEIPT_BALANCE",
  "MANYCHAT_RECEIPT_FLOW_ID",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const VALID_ENV: Record<EnvKey, string> = {
  MANYCHAT_API_KEY: "test-key",
  WHATSAPP_PHONE_FIELD_ID: "field-phone",
  MANYCHAT_FIELD_RECEIPT_LINK: "field-receipt-link",
  MANYCHAT_FIELD_RECEIPT_FOLIO: "field-receipt-folio",
  MANYCHAT_FIELD_RECEIPT_AMOUNT: "field-receipt-amount",
  MANYCHAT_FIELD_RECEIPT_BALANCE: "field-receipt-balance",
  MANYCHAT_RECEIPT_FLOW_ID: "flow-receipt",
};

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function setEnv(values: Partial<Record<EnvKey, string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const message = {
  phone: "8112345678",
  clientName: "María Pérez",
  receiptUrl: "https://contratos.ejemplo.com/comprobantes/view/tok_ABC-123",
  paymentFolio: "PG-0007",
  amount: "$5,000.00",
  balance: "$8,000.00",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setEnv(VALID_ENV);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setEnv(originalEnv);
});

describe("sendReceiptWhatsAppMessage", () => {
  it("sets link, folio, amount and balance on the subscriber, then sends the RECEIPT flow", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: "success", data: [{ id: "sub-9", whatsapp_phone: "+5218112345678" }] })
      )
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: null }))
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: null }));

    expect(await sendReceiptWhatsAppMessage(message)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [fieldsUrl, fieldsInit] = fetchMock.mock.calls[1];
    expect(fieldsUrl).toContain("/fb/subscriber/setCustomFields");
    expect(JSON.parse(fieldsInit.body)).toEqual({
      subscriber_id: "sub-9",
      fields: [
        { field_id: "field-receipt-link", field_value: message.receiptUrl },
        { field_id: "field-receipt-folio", field_value: "PG-0007" },
        { field_id: "field-receipt-amount", field_value: "$5,000.00" },
        { field_id: "field-receipt-balance", field_value: "$8,000.00" },
      ],
    });

    const [flowUrl, flowInit] = fetchMock.mock.calls[2];
    expect(flowUrl).toContain("/fb/sending/sendFlow");
    expect(JSON.parse(flowInit.body)).toEqual({ subscriber_id: "sub-9", flow_ns: "flow-receipt" });
  });

  it("fails softly, naming every missing variable, and never calls ManyChat on partial config", async () => {
    setEnv({ ...VALID_ENV, MANYCHAT_FIELD_RECEIPT_BALANCE: undefined, MANYCHAT_RECEIPT_FLOW_ID: "  " });
    expect(await sendReceiptWhatsAppMessage(message)).toEqual({
      ok: false,
      message:
        "Falta configurar MANYCHAT_FIELD_RECEIPT_BALANCE, MANYCHAT_RECEIPT_FLOW_ID para enviar el WhatsApp.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a ManyChat business error from the flow call as the step failure", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: "success", data: [{ id: "sub-9", whatsapp_phone: "+5218112345678" }] })
      )
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: null }))
      .mockResolvedValueOnce(jsonResponse({ status: "error", message: "Flow not found" }));

    expect(await sendReceiptWhatsAppMessage(message)).toEqual({
      ok: false,
      message: "No se pudo disparar el envío del comprobante por WhatsApp en ManyChat: Flow not found",
    });
  });
});
