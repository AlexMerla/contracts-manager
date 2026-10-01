import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeMexicanMobile,
  sendContractWhatsAppMessage,
} from "@/lib/whatsapp/manychat";

// SAFETY: `vitest.config.mts` loads the real `.env` through `dotenv/config`,
// so a LIVE `MANYCHAT_API_KEY` for the business's production account is in
// `process.env` while this suite runs. `global.fetch` is stubbed for every
// test here — no case may be added that leaves it unstubbed, exactly as
// src/lib/google/drive.test.ts does for the Google endpoints.

const ENV_KEYS = [
  "MANYCHAT_API_KEY",
  "WHATSAPP_PHONE_FIELD_ID",
  "MANYCHAT_FIELD_CONTRACT_LINK",
  "MANYCHAT_FIELD_FOLIO",
  "MANYCHAT_FLOW_ID",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const message = {
  phone: "8112345678",
  clientName: "María Pérez",
  folio: "03142",
  viewerUrl: "https://contratos.ejemplo.com/contracts/view/tok-123",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const VALID_ENV = {
  MANYCHAT_API_KEY: "test-key",
  WHATSAPP_PHONE_FIELD_ID: "field-phone",
  MANYCHAT_FIELD_CONTRACT_LINK: "field-link",
  MANYCHAT_FIELD_FOLIO: "field-folio",
  MANYCHAT_FLOW_ID: "flow-ns-1",
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

describe("normalizeMexicanMobile", () => {
  it("prefixes a bare 10-digit Mexican mobile with 521", () => {
    expect(normalizeMexicanMobile("8112345678")).toBe("5218112345678");
  });

  it("strips punctuation before normalising", () => {
    expect(normalizeMexicanMobile("(81) 1234-5678")).toBe("5218112345678");
  });

  it("leaves an already-521 number untouched", () => {
    expect(normalizeMexicanMobile("5218112345678")).toBe("5218112345678");
  });

  it("upgrades a 52-prefixed number to 521", () => {
    expect(normalizeMexicanMobile("528112345678")).toBe("5218112345678");
  });

  it("rejects anything shorter than 10 digits instead of forwarding junk", () => {
    expect(normalizeMexicanMobile("123")).toBeNull();
    expect(normalizeMexicanMobile("")).toBeNull();
  });
});

describe("sendContractWhatsAppMessage", () => {
  it("reuses an existing subscriber, sets both custom fields, and sends the flow", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          status: "success",
          data: [{ id: "sub-9", whatsapp_phone: "+5218112345678" }],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: null }))
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: null }));

    expect(await sendContractWhatsAppMessage(message)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [findUrl] = fetchMock.mock.calls[0];
    expect(findUrl).toContain("/fb/subscriber/findByCustomField");
    expect(findUrl).toContain("field_id=field-phone");
    expect(findUrl).toContain("field_value=5218112345678");

    const [fieldsUrl, fieldsInit] = fetchMock.mock.calls[1];
    expect(fieldsUrl).toContain("/fb/subscriber/setCustomFields");
    expect(JSON.parse(fieldsInit.body)).toEqual({
      subscriber_id: "sub-9",
      fields: [
        // D2: the FULL absolute URL, not a bare token.
        { field_id: "field-link", field_value: message.viewerUrl },
        { field_id: "field-folio", field_value: "03142" },
      ],
    });

    const [flowUrl, flowInit] = fetchMock.mock.calls[2];
    expect(flowUrl).toContain("/fb/sending/sendFlow");
    expect(JSON.parse(flowInit.body)).toEqual({
      subscriber_id: "sub-9",
      flow_ns: "flow-ns-1",
    });
  });

  it("creates the subscriber when the lookup returns no match", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: [] }))
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: { id: "sub-new" } }))
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: null }))
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: null }));

    expect(await sendContractWhatsAppMessage(message)).toEqual({ ok: true });

    const [createUrl, createInit] = fetchMock.mock.calls[1];
    expect(createUrl).toContain("/fb/subscriber/createSubscriber");
    expect(JSON.parse(createInit.body)).toEqual({
      first_name: "María Pérez",
      whatsapp_phone: "+5218112345678",
      has_opt_in_message_whatsapp: true,
    });
  });

  it("treats a 200 response carrying status:error as a failure", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "success", data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "error", message: "Invalid WhatsApp number" })
      );

    const result = await sendContractWhatsAppMessage(message);
    expect(result).toEqual({
      ok: false,
      message: "No se pudo crear el contacto en ManyChat: Invalid WhatsApp number",
    });
  });

  it("returns a failure value instead of throwing when fetch itself rejects", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const result = await sendContractWhatsAppMessage(message);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/ECONNRESET/);
  });

  it("stops before any network call when configuration is incomplete", async () => {
    setEnv({ ...VALID_ENV, MANYCHAT_FLOW_ID: undefined });
    const result = await sendContractWhatsAppMessage(message);
    expect(result).toEqual({
      ok: false,
      message: "Falta configurar MANYCHAT_FLOW_ID para enviar el WhatsApp.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unusable phone number before any network call", async () => {
    const result = await sendContractWhatsAppMessage({ ...message, phone: "123" });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
