import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// NOTE: this file must never reach Resend. `vitest.config.mts` loads the
// real `.env` via `dotenv/config`, so a live `RESEND_API_KEY` is present in
// the test process: no test here may construct a Resend client or let one
// be constructed on its behalf.
//
// `sendContractEmail` sends a fixed-content Resend Template now (no local
// HTML/text to unit-test — the copy lives in Resend's dashboard, see
// src/lib/email/templates/precontract-confirmation.html for the mirrored
// source kept in the repo for reference). `sendContractEmail`'s full wiring
// (a real send) is covered in src/app/(app)/contratos/contratos-actions.test.ts,
// where the whole module is mocked. The one thing left to test directly here
// is the idempotency guard: it calls the real `sendContractEmail` against a
// real DB row, but is still Resend-safe because the `emailSent === true`
// check is the FIRST thing the function does — it returns before
// `resendFromAddress()`/`resendClient()` ever run, so no Resend client is
// ever constructed for this test.
import { sendContractEmail } from "@/lib/email/contract-email";
import { prisma } from "@/lib/prisma";

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
