import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addContactToWorkflow,
  highLevelStatusMessage,
  setNewContactName,
  upsertContact,
} from "./client";

// SAFETY: `vitest.config.mts` loads the real `.env`, so a LIVE HighLevel PIT
// may be in `process.env`. Every test here stubs `fetch` and passes a fake
// token explicitly; no case may leave `fetch` unstubbed.

const TOKEN = "pit-test-token";
let fetchMock: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const upsertInput = {
  token: TOKEN,
  locationId: "loc-1",
  phone: "+528112345678",
  customFields: [{ key: "contrato_folio", field_value: "03142" }],
};

describe("highLevelStatusMessage (R6 S6.1)", () => {
  it.each([
    [401, "HighLevel rechazó el token de acceso."],
    [403, "El token de HighLevel no tiene permiso para esta operación."],
    [422, "HighLevel rechazó los datos enviados."],
    [400, "HighLevel rechazó los datos enviados."],
    [429, "HighLevel limitó las solicitudes; intente de nuevo en unos minutos."],
    [500, "HighLevel no está disponible por el momento."],
    [503, "HighLevel no está disponible por el momento."],
    [404, "HighLevel respondió con un error (HTTP 404)."],
  ])("maps %i", (status, message) => {
    expect(highLevelStatusMessage(status)).toBe(message);
  });
});

describe("upsertContact", () => {
  it("POSTs exactly {locationId, phone, customFields} with Bearer + Version v3 (R1, S6.3)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ new: false, contact: { id: "c-1" } }, 201));

    expect(await upsertContact(upsertInput)).toEqual({ ok: true, data: { contactId: "c-1", isNew: false } });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://services.leadconnectorhq.com/contacts/upsert");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, Version: "v3" });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["customFields", "locationId", "phone"]);
    expect(body).toEqual({
      locationId: "loc-1",
      phone: "+528112345678",
      customFields: [{ key: "contrato_folio", field_value: "03142" }],
    });
  });

  it("reports isNew only for new === true", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ new: true, contact: { id: "c-2" } }, 201));
    expect(await upsertContact(upsertInput)).toEqual({ ok: true, data: { contactId: "c-2", isNew: true } });
  });

  it("fails when the response carries no contact id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ new: true }, 201));
    expect(await upsertContact(upsertInput)).toEqual({
      ok: false,
      message: "HighLevel respondió algo que no se pudo interpretar.",
    });
  });

  it("returns the network message instead of throwing when fetch rejects (S6.2)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await upsertContact(upsertInput)).toEqual({ ok: false, message: "No se pudo conectar con HighLevel." });
  });

  // R7 S7.1: logs carry the status only — never the token, phone or body.
  it("never logs the token, the phone or the response body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: "Contacto María Pérez +528112345678 cliente@example.com inválido" }, 422)
    );
    expect(await upsertContact(upsertInput)).toEqual({ ok: false, message: "HighLevel rechazó los datos enviados." });

    const logged = errorSpy.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("422");
    for (const secret of [TOKEN, "8112345678", "María", "cliente@example.com"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("setNewContactName", () => {
  it("PUTs exactly {name} to the contact", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ succeded: true, contact: { id: "c-2" } }));
    expect(await setNewContactName({ token: TOKEN, contactId: "c-2", name: "María Pérez" })).toEqual({
      ok: true,
      data: null,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://services.leadconnectorhq.com/contacts/c-2");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ name: "María Pérez" });
  });
});

describe("addContactToWorkflow", () => {
  it("accepts 201 {succeeded: true}", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ succeeded: true, traceId: "t" }, 201));
    expect(await addContactToWorkflow({ token: TOKEN, contactId: "c-1", workflowId: "wf-1" })).toEqual({
      ok: true,
      data: null,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://services.leadconnectorhq.com/contacts/c-1/workflow/wf-1");
    expect(init.method).toBe("POST");
  });

  it("accepts HighLevel's typo key `succeded`", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ succeded: true }, 201));
    expect((await addContactToWorkflow({ token: TOKEN, contactId: "c-1", workflowId: "wf-1" })).ok).toBe(true);
  });

  it("rejects a 2xx that does not confirm success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ succeeded: false }, 200));
    expect(await addContactToWorkflow({ token: TOKEN, contactId: "c-1", workflowId: "wf-1" })).toEqual({
      ok: false,
      message: "HighLevel no confirmó el envío al flujo de WhatsApp.",
    });
  });

  it("maps a 5xx to the unavailable message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 502));
    expect(await addContactToWorkflow({ token: TOKEN, contactId: "c-1", workflowId: "wf-1" })).toEqual({
      ok: false,
      message: "HighLevel no está disponible por el momento.",
    });
  });
});
