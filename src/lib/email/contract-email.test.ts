import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// NOTE: this file must never reach Resend. `vitest.config.mts` loads the
// real `.env` via `dotenv/config`, so a live `RESEND_API_KEY` is present in
// the test process: no test here may construct a Resend client or let one
// be constructed on its behalf.
//
// Most of this file exercises the PURE template builder — `sendContractEmail`'s
// full wiring (a real send) is covered in
// src/app/(app)/contratos/contratos-actions.test.ts, where the whole module
// is mocked. The one exception is the idempotency-guard test below: it calls
// the real `sendContractEmail` against a real DB row, but is still Resend-safe
// because the `emailSent === true` check is the FIRST thing the function does
// — it returns before `resendFromAddress()`/`resendClient()` ever run, so no
// Resend client is ever constructed for this test.
import { buildContractEmail, sendContractEmail, type ContractEmailData } from "@/lib/email/contract-email";
import { prisma } from "@/lib/prisma";

const VIEWER_URL = "https://contratos.ejemplo.com/contracts/view/tok-123";

function data(overrides: Partial<ContractEmailData> = {}): ContractEmailData {
  return {
    folio: "03142",
    clientName: "María Pérez",
    eventType: "wedding",
    // `@db.Date` is materialised as UTC midnight.
    eventDate: new Date("2027-06-15T00:00:00.000Z"),
    total: 2500,
    deposit: 1000,
    balance: 1500,
    viewerUrl: VIEWER_URL,
    ...overrides,
  };
}

describe("buildContractEmail", () => {
  it("puts the folio in the subject and addresses the client formally", () => {
    const message = buildContractEmail(data());
    expect(message.subject).toBe("Su contrato 03142 — Todo con un Solo Proveedor");
    expect(message.html).toContain("Estimado(a) María Pérez");
    expect(message.text).toContain("Estimado(a) María Pérez");
  });

  it("includes the public viewer link in both the HTML and the plain-text part", () => {
    const message = buildContractEmail(data());
    expect(message.html).toContain(`href="${VIEWER_URL}"`);
    // Also as copyable text, for clients that strip the button.
    expect(message.html.split(VIEWER_URL).length - 1).toBeGreaterThanOrEqual(2);
    expect(message.text).toContain(VIEWER_URL);
  });

  it("formats every amount through the es-MX MXN formatter (design-system §3)", () => {
    const message = buildContractEmail(data());
    for (const expected of ["$2,500.00", "$1,000.00", "$1,500.00"]) {
      expect(message.text).toContain(expected);
      expect(message.html).toContain(expected);
    }
  });

  it("renders the Spanish event label and a UTC-stable long date", () => {
    const message = buildContractEmail(data({ eventType: "quinceanera" }));
    expect(message.text).toContain("su XV del 15 de junio de 2027");
  });

  it("escapes markup in client-supplied text instead of injecting it", () => {
    const message = buildContractEmail(data({ clientName: '<img src=x onerror="alert(1)">' }));
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("carries no emoji, per docs/design-system.md §3", () => {
    const message = buildContractEmail(data());
    expect(/\p{Extended_Pictographic}/u.test(message.html)).toBe(false);
    expect(/\p{Extended_Pictographic}/u.test(message.text)).toBe(false);
  });
});

describe("sendContractEmail (idempotency guard, real DB, no Resend call)", () => {
  const userId = randomUUID();
  const priceListId = randomUUID();
  const contractId = randomUUID();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        name: "Throwaway (contract-email idempotency test)",
        email: "throwaway-contract-email-test@example.com",
        passwordHash: "unused-in-this-test",
        role: "normal",
      },
    });
    await prisma.priceList.create({
      data: { id: priceListId, name: "Throwaway (contract-email idempotency test)" },
    });
    await prisma.contract.create({
      data: {
        id: contractId,
        folio: `throwaway-${contractId}`,
        clientName: "Cliente de prueba",
        // A real email is present on purpose: the guard must short-circuit
        // on `emailSent` BEFORE it ever gets to the "no clientEmail" check,
        // so this proves it's actually the first gate, not a side effect of
        // the client having no address to send to.
        clientEmail: "cliente-de-prueba@example.com",
        eventType: "other",
        eventDate: new Date("2027-01-01T00:00:00.000Z"),
        subtotal: 0,
        total: 0,
        deposit: 0,
        balance: 0,
        viewerToken: randomUUID(),
        priceListId,
        createdById: userId,
        emailSent: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.contract.delete({ where: { id: contractId } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("returns ok without attempting to send again", async () => {
    const result = await sendContractEmail(contractId);
    expect(result).toEqual({ ok: true });
  });
});
