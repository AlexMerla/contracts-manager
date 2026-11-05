import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// highlevel-whatsapp — unit tests with Prisma mocked and `fetch` stubbed.
// SAFETY: `vitest.config.mts` loads the real `.env`, so the LIVE HighLevel
// PIT and workflow ids are in `process.env`. Every test overwrites them with
// fakes and stubs `fetch`; no case may reach ru42.
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { contract: { findUnique: mocks.findUnique, update: mocks.update } },
}));

import {
  sendContractWhatsApp,
  sendContractWhatsAppMessage,
  sendReceiptWhatsAppMessage,
} from "./highlevel-whatsapp";

const ENV_KEYS = [
  "HIGHLEVEL_PIT_TOKEN",
  "HIGHLEVEL_LOCATION_ID",
  "HIGHLEVEL_CONTRACT_WORKFLOW_ID",
  "HIGHLEVEL_RECEIPT_WORKFLOW_ID",
  "APP_BASE_URL",
] as const;
type EnvKey = (typeof ENV_KEYS)[number];

const VALID_ENV: Record<EnvKey, string> = {
  HIGHLEVEL_PIT_TOKEN: "pit-test",
  HIGHLEVEL_LOCATION_ID: "loc-test",
  HIGHLEVEL_CONTRACT_WORKFLOW_ID: "wf-contract",
  HIGHLEVEL_RECEIPT_WORKFLOW_ID: "wf-receipt",
  APP_BASE_URL: "https://contratos.ejemplo.com",
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const CONTRACT_ID = "7d1e4c8a-0000-4000-8000-000000000001";
const VIEWER_TOKEN = "viewer-tok-123";

const contractMessage = {
  phone: "81 1234 5678",
  clientName: "María Pérez",
  folio: "03142",
  viewerUrl: `https://contratos.ejemplo.com/contracts/view/${VIEWER_TOKEN}`,
};

const receiptMessage = {
  phone: "8112345678",
  clientName: "María Pérez",
  paymentFolio: "PG-0007",
  amountCents: 150_000,
  balanceCents: 250_000,
  receiptUrl: "https://contratos.ejemplo.com/comprobantes/view/rcpt-tok",
};

let fetchMock: ReturnType<typeof vi.fn>;

/** Records (method, path, body) of every request. */
function requests(): { method: string; path: string; body: Record<string, unknown> }[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    method: String(init.method),
    path: new URL(String(url)).pathname,
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  }));
}

function existingContact() {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ new: false, contact: { id: "c-old" } }, 201))
    .mockResolvedValueOnce(jsonResponse({ succeeded: true, succeded: true, traceId: "t" }, 201));
}

beforeEach(() => {
  setEnv(VALID_ENV);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.update.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.findUnique.mockReset();
  mocks.update.mockReset();
  setEnv(originalEnv);
});

describe("sendContractWhatsAppMessage", () => {
  // S1.1 + S1.5 + S1.4
  it("upserts an existing contact with only the 3 contrato_* fields, then enrolls — no name call", async () => {
    existingContact();

    expect(await sendContractWhatsAppMessage(contractMessage)).toEqual({ ok: true });

    const [upsert, enroll, ...rest] = requests();
    expect(rest).toEqual([]);
    expect(upsert).toEqual({
      method: "POST",
      path: "/contacts/upsert",
      body: {
        locationId: "loc-test",
        phone: "+528112345678",
        customFields: [
          { key: "contrato_cliente", field_value: "María Pérez" },
          { key: "contrato_folio", field_value: "03142" },
          { key: "contrato_link", field_value: contractMessage.viewerUrl },
        ],
      },
    });
    expect(enroll).toMatchObject({ method: "POST", path: "/contacts/c-old/workflow/wf-contract" });
  });

  // S1.3
  it("names a contact HighLevel just created, with {name} only, before enrolling", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ new: true, contact: { id: "c-new" } }, 201))
      .mockResolvedValueOnce(jsonResponse({ succeded: true, contact: { id: "c-new" } }))
      .mockResolvedValueOnce(jsonResponse({ succeeded: true }, 201));

    expect(await sendContractWhatsAppMessage(contractMessage)).toEqual({ ok: true });

    const calls = requests();
    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /contacts/upsert",
      "PUT /contacts/c-new",
      "POST /contacts/c-new/workflow/wf-contract",
    ]);
    expect(calls[1]?.body).toEqual({ name: "María Pérez" });
  });

  // S1.7
  it("still enrolls when the new contact's name write fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ new: true, contact: { id: "c-new" } }, 201))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ succeeded: true }, 201));

    expect(await sendContractWhatsAppMessage(contractMessage)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // R1: no marketing-owned key in any request body.
  it("never sends name/email/tags in the upsert", async () => {
    existingContact();
    await sendContractWhatsAppMessage(contractMessage);
    const upsertBody = requests()[0]?.body ?? {};
    for (const key of ["name", "firstName", "lastName", "email", "tags", "createNewIfDuplicateAllowed"]) {
      expect(upsertBody).not.toHaveProperty(key);
    }
  });

  // S2.4
  it.each([[null], [""], ["12345"]])("refuses mobile %j with zero HTTP calls", async (phone) => {
    expect(await sendContractWhatsAppMessage({ ...contractMessage, phone })).toEqual({
      ok: false,
      message: "El cliente no tiene un celular válido para WhatsApp.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // S2.5
  it.each(["HIGHLEVEL_PIT_TOKEN", "HIGHLEVEL_LOCATION_ID", "HIGHLEVEL_CONTRACT_WORKFLOW_ID"] as const)(
    "refuses with zero HTTP calls when %s is missing",
    async (key) => {
      setEnv({ ...VALID_ENV, [key]: undefined });
      expect(await sendContractWhatsAppMessage(contractMessage)).toEqual({
        ok: false,
        message: "WhatsApp (HighLevel) no está configurado.",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  // S2.2
  it("returns the mapped message when enrollment answers 5xx", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ new: false, contact: { id: "c-old" } }, 201))
      .mockResolvedValueOnce(jsonResponse({}, 503));
    expect(await sendContractWhatsAppMessage(contractMessage)).toEqual({
      ok: false,
      message: "HighLevel no está disponible por el momento.",
    });
  });
});

describe("sendReceiptWhatsAppMessage", () => {
  // S1.2 + S4.1
  it("writes exactly the 5 comprobante_* fields, money preformatted es-MX", async () => {
    existingContact();

    expect(await sendReceiptWhatsAppMessage(receiptMessage)).toEqual({ ok: true });

    const [upsert, enroll] = requests();
    expect(upsert?.body).toEqual({
      locationId: "loc-test",
      phone: "+528112345678",
      customFields: [
        { key: "comprobante_cliente", field_value: "María Pérez" },
        { key: "comprobante_folio", field_value: "PG-0007" },
        { key: "comprobante_monto", field_value: "$1,500.00 MXN" },
        { key: "comprobante_saldo", field_value: "$2,500.00 MXN" },
        { key: "comprobante_link", field_value: receiptMessage.receiptUrl },
      ],
    });
    expect(enroll?.path).toBe("/contacts/c-old/workflow/wf-receipt");
  });

  it("writes 'Liquidado' when nothing is owed", async () => {
    existingContact();
    await sendReceiptWhatsAppMessage({ ...receiptMessage, balanceCents: 0 });
    const fields = requests()[0]?.body.customFields as { key: string; field_value: string }[];
    expect(fields.find(({ key }) => key === "comprobante_saldo")?.field_value).toBe("Liquidado");
  });

  // Env: all-or-nothing PER FLOW.
  it("is refused when only the contract workflow is configured, while contracts still send", async () => {
    setEnv({ ...VALID_ENV, HIGHLEVEL_RECEIPT_WORKFLOW_ID: undefined });
    expect(await sendReceiptWhatsAppMessage(receiptMessage)).toEqual({
      ok: false,
      message: "WhatsApp (HighLevel) no está configurado.",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    existingContact();
    expect(await sendContractWhatsAppMessage(contractMessage)).toEqual({ ok: true });
  });
});

describe("sendContractWhatsApp", () => {
  function contractRow(contractStatus: string, clientMobile: string | null = "8112345678") {
    return { folio: "03142", clientName: "María Pérez", clientMobile, viewerToken: VIEWER_TOKEN, contractStatus };
  }

  // S2.1 + S4.2
  it("sends the viewerToken link (never the id) and sets whatsappSent", async () => {
    mocks.findUnique.mockResolvedValue(contractRow("pre_contract"));
    existingContact();

    expect(await sendContractWhatsApp(CONTRACT_ID)).toEqual({ ok: true });

    const fields = requests()[0]?.body.customFields as { key: string; field_value: string }[];
    const link = fields.find(({ key }) => key === "contrato_link")?.field_value;
    expect(link).toBe(`https://contratos.ejemplo.com/contracts/view/${VIEWER_TOKEN}`);
    expect(JSON.stringify(requests())).not.toContain(CONTRACT_ID);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: CONTRACT_ID }, data: { whatsappSent: true } });
  });

  // S2.3
  it("refuses a cancelled contract before any HTTP call or flag write", async () => {
    mocks.findUnique.mockResolvedValue(contractRow("cancelled"));
    expect(await sendContractWhatsApp(CONTRACT_ID)).toEqual({
      ok: false,
      message: "No se puede enviar por WhatsApp un contrato cancelado.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("leaves whatsappSent untouched when HighLevel fails", async () => {
    mocks.findUnique.mockResolvedValue(contractRow("confirmed"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429));
    expect(await sendContractWhatsApp(CONTRACT_ID)).toEqual({
      ok: false,
      message: "HighLevel limitó las solicitudes; intente de nuevo en unos minutos.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses a contract without a mobile with zero HTTP calls", async () => {
    mocks.findUnique.mockResolvedValue(contractRow("confirmed", null));
    expect(await sendContractWhatsApp(CONTRACT_ID)).toEqual({
      ok: false,
      message: "El cliente no tiene un celular válido para WhatsApp.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an unknown contract", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await sendContractWhatsApp(CONTRACT_ID)).toEqual({ ok: false, message: "Contrato no encontrado." });
  });
});
