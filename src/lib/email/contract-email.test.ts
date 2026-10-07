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
// is the "no clientEmail" early return — the only path that still returns
// before `resendFromAddress()`/`resendClient()` ever run, so it's the only
// scenario this file can safely exercise against the real DB without ever
// constructing a Resend client.
//
// There is deliberately NO idempotency-guard test here anymore: resending an
// already-`emailSent` contract is now a real, intentional action (the
// "Reenviar" menu is always available, same as WhatsApp's retry — see
// sendContractEmail's doc comment), not something this file could verify
// without actually calling Resend.
import { sendContractEmail } from "@/lib/email/contract-email";
import { prisma } from "@/lib/prisma";

describe("sendContractEmail (no-clientEmail guard, real DB, no Resend call)", () => {
  const userId = randomUUID();
  const priceListId = randomUUID();
  const contractId = randomUUID();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        name: "Throwaway (contract-email no-clientEmail test)",
        email: "throwaway-contract-email-noemail-test@example.com",
        passwordHash: "unused-in-this-test",
        role: "normal",
      },
    });
    await prisma.priceList.create({
      data: { id: priceListId, name: "Throwaway (contract-email no-clientEmail test)" },
    });
    await prisma.contract.create({
      data: {
        id: contractId,
        folio: `throwaway-${contractId}`,
        clientName: "Cliente sin correo",
        clientEmail: null,
        eventType: "other",
        eventDate: new Date("2027-01-01T00:00:00.000Z"),
        subtotal: 0,
        total: 0,
        deposit: 0,
        balance: 0,
        viewerToken: randomUUID(),
        priceListId,
        createdById: userId,
      },
    });
  });

  afterAll(async () => {
    await prisma.contract.delete({ where: { id: contractId } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("returns an error instead of attempting to send", async () => {
    const result = await sendContractEmail(contractId);
    expect(result).toEqual({
      ok: false,
      message: "El contrato no tiene correo del cliente; no hay a dónde enviarlo.",
    });
  });
});
