import { Resend } from "resend";

import { getContractImageBuffer } from "@/lib/contract-template/get-contract-image-buffer";
import {
  stepErrorMessage,
  type ContractDeliveryStepResult,
} from "@/lib/contracts/delivery-step";
import { prisma } from "@/lib/prisma";

// Sprint-07 tasks 2 & 3 — deliver the contract to the client by email
// (spec §3: Resend; §4.2: a sequential in-process step with retry by status
// column; §6.4: `contracts.email_sent`).
//
// Content lives in a Resend dashboard Template (id below), not in this file
// (product decision, superseding the earlier hand-built-HTML design): the
// business wants to edit copy/bank details themselves without a code change,
// and the email body is fixed regardless of contract data — only the
// recipient and the attached image vary per send. The template has exactly
// one variable, `CLIENT_NAME` (text-only, in the greeting) — see
// src/lib/email/templates/precontract-confirmation.html for the mirrored
// source kept in the repo for reference. Deliberately NOT a variable: the
// public viewer link. Resend's REST API mangles template variables used
// inside an HTML attribute (resend/react-email#3247) — a `{{{VAR}}}` inside
// an `href` breaks — and this template has no such link at all, so the bug
// never applies here.
const PRECONTRACT_CONFIRMATION_TEMPLATE_ID = "precontract-confirmation-1";

// Transport choice (D5): the official `resend` SDK, NOT the hand-rolled
// `fetch` wrapper used for Google. The reason the Google code avoids its
// vendor SDK (`googleapis` bundles discovery documents for every Google API
// and a second OAuth implementation) does not apply here: `resend` is a thin
// typed client over one endpoint, it already returns `{ data, error }`
// instead of throwing for an API error, and multipart attachment encoding is
// the one part worth not reimplementing. ManyChat keeps plain `fetch` because
// it has no maintained SDK — so the two integrations share the RESULT TYPE
// (`ContractDeliveryStepResult`) and nothing else. A single generic
// "external call" helper over an SDK and a bespoke `{status:"success"}`
// envelope would abstract two things that have nothing in common.

/** Required because an unverified sender silently bounces every delivery —
 * there is no safe default to fall back to. */
function resendFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    throw new Error(
      "RESEND_FROM_EMAIL no está configurada. Defina el remitente verificado en Resend " +
        '(por ejemplo "Todo con un Solo Proveedor <contratos@sudominio.com>").'
    );
  }
  return from;
}

function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY no está configurada; no se puede enviar el correo.");
  }
  // Constructed per call rather than memoised: at ~2 contracts/week (§4.2)
  // the allocation is free, and it removes any chance of holding a client
  // built from a rotated key.
  return new Resend(apiKey);
}

/**
 * Sends the fixed-content "precontract-confirmation" Resend Template to
 * `clientEmail` with the OFFICIAL contract JPEG attached, then sets
 * `contracts.emailSent`. Never throws for a configuration or API failure
 * (spec §4.2) — the confirm pipeline and the retry action both read the
 * returned result instead.
 *
 * The public viewer link is intentionally NOT included here — ManyChat
 * already sends it over WhatsApp (spec §3), and ops can always copy it from
 * the contract detail page (sprint-07 task 5). Only the `"contract"` variant
 * is ever attached — the pre-contract render exists for the business's own
 * Drive archive, never for the client.
 *
 * No idempotency guard on `emailSent` (deliberately removed — see the open
 * question this answers): this is called automatically exactly ONCE, from
 * `createContract`'s confirm pipeline, so there is no automatic-retry path
 * that could double-send on its own. Every OTHER call comes from the
 * "Reenviar" menu's explicit, human click — a real request to resend, which
 * must actually resend, same as `triggerContractWhatsApp` has never gated on
 * a "sent already" flag. `emailSent` still gets set to `true` after every
 * successful send; it is read elsewhere only as "has this ever gone out"
 * (the list's pending-steps indicator), never as a block.
 */
export async function sendContractEmail(
  contractId: string
): Promise<ContractDeliveryStepResult> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      folio: true,
      clientName: true,
      clientEmail: true,
    },
  });
  if (!contract) {
    return { ok: false, message: "Contrato no encontrado." };
  }

  if (!contract.clientEmail) {
    return {
      ok: false,
      message: "El contrato no tiene correo del cliente; no hay a dónde enviarlo.",
    };
  }

  let from: string;
  try {
    from = resendFromAddress();
  } catch (error: unknown) {
    return { ok: false, message: stepErrorMessage(error) };
  }

  let image: Buffer;
  try {
    image = await getContractImageBuffer(contractId, "contract");
  } catch (error: unknown) {
    return {
      ok: false,
      message: `No se pudo generar la imagen del contrato para adjuntarla: ${stepErrorMessage(error)}`,
    };
  }

  let response: Awaited<ReturnType<Resend["emails"]["send"]>>;
  try {
    response = await resendClient().emails.send({
      from,
      to: contract.clientEmail,
      template: {
        id: PRECONTRACT_CONFIRMATION_TEMPLATE_ID,
        variables: { CLIENT_NAME: contract.clientName },
      },
      attachments: [
        {
          // Same naming convention as the Drive copy (`contractDriveFileName`).
          filename: `Contrato${contract.folio}.jpg`,
          content: image,
          contentType: "image/jpeg",
        },
      ],
    });
  } catch (error: unknown) {
    return {
      ok: false,
      message: `No se pudo enviar el correo al cliente: ${stepErrorMessage(error)}`,
    };
  }

  if (response.error) {
    return {
      ok: false,
      message: `No se pudo enviar el correo al cliente: ${response.error.message}`,
    };
  }

  // Resend acknowledged the request with no `error` — log the message id it
  // handed back so a "said it sent, but it never shows up in Resend's own
  // dashboard" report has something concrete to search by, instead of a
  // dead end once `emailSent` flips and this path can't be re-run.
  console.log(
    `Resend accepted contract ${contract.folio}'s email (id ${response.data?.id ?? "unknown"}).`
  );

  await prisma.contract.update({
    where: { id: contractId },
    data: { emailSent: true },
  });

  return { ok: true };
}
