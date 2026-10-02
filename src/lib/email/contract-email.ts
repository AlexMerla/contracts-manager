import { Resend } from "resend";

import { contractViewerUrl } from "@/lib/app-url";
import { formatMoney } from "@/lib/contract-template/format-money";
import { getContractImageBuffer } from "@/lib/contract-template/get-contract-image-buffer";
import {
  stepErrorMessage,
  type ContractDeliveryStepResult,
} from "@/lib/contracts/delivery-step";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";
import { prisma } from "@/lib/prisma";
import type { EventType } from "@/generated/prisma/client";

// Sprint-07 tasks 2 & 3 — deliver the contract to the client by email
// (spec §3: Resend; §4.2: a sequential in-process step with retry by status
// column; §6.4: `contracts.email_sent`).
//
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

/** Only the es-MX date matters here; the image carries the full detail. */
const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  // `eventDate` is `@db.Date` → UTC midnight. Same guard as the detail page.
  timeZone: "UTC",
});

export interface ContractEmailData {
  folio: string;
  clientName: string;
  eventType: EventType;
  eventDate: Date;
  total: number;
  deposit: number;
  balance: number;
  viewerUrl: string;
}

export interface ContractEmailMessage {
  subject: string;
  html: string;
  text: string;
}

/** Minimal HTML escaping — every interpolated value below is client-supplied
 * free text that must not be able to inject markup into the message body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pure — builds subject/HTML/plain-text from contract data. Exported
 * separately from the sending step so the copy can be unit-tested without
 * Resend, mirroring `buildContractCalendarEvent` in `@/lib/google/calendar`.
 *
 * Copy (D3) is adapted from the legacy Gmail template
 * (`events-manager/services/email/templates/precontract-confirmation.html`):
 * same register and same closing, re-voiced for this project's content rules
 * (docs/design-system.md §3 — formal "usted", sentence case, no emoji, and
 * amounts through the single `Intl.NumberFormat('es-MX')` formatter). The
 * legacy template's hardcoded bank-transfer block is deliberately NOT ported:
 * payment instructions are not defined anywhere in docs/spec.md, and account
 * numbers do not belong in source. See the design's Open Questions.
 *
 * Layout is a single centred table with inline styles — the only thing email
 * clients render reliably. No Tailwind, no external CSS, no web fonts.
 */
export function buildContractEmail(data: ContractEmailData): ContractEmailMessage {
  const eventLabel = EVENT_TYPE_LABEL[data.eventType];
  const eventDate = dateFormatter.format(data.eventDate);
  const subject = `Su contrato ${data.folio} — Todo con un Solo Proveedor`;

  const amounts: [string, number][] = [
    ["Total", data.total],
    ["Anticipo", data.deposit],
    ["Saldo", data.balance],
  ];

  const text = [
    `Estimado(a) ${data.clientName}:`,
    "",
    "Agradecemos sinceramente la confianza que deposita en nosotros al elegirnos como su " +
      "proveedor de servicios para este evento tan especial.",
    "",
    `Adjuntamos su contrato ${data.folio}, correspondiente a su ${eventLabel} del ${eventDate}. ` +
      "También puede consultarlo en línea en el siguiente enlace:",
    data.viewerUrl,
    "",
    ...amounts.map(([label, amount]) => `${label}: ${formatMoney(amount)}`),
    "",
    "Si algún dato requiere corrección, escríbanos a info@todoconunsoloproveedor.com " +
      "o contáctenos por WhatsApp.",
    "",
    "Atentamente,",
    "Todo con un Solo Proveedor",
  ].join("\n");

  const amountRows = amounts
    .map(
      ([label, amount], index) =>
        `<tr>` +
        `<td style="padding:6px 0;color:#52525b;font-size:14px;${
          index === amounts.length - 1 ? "font-weight:600;color:#18181b;" : ""
        }">${escapeHtml(label)}</td>` +
        `<td align="right" style="padding:6px 0;font-size:14px;font-variant-numeric:tabular-nums;${
          index === amounts.length - 1 ? "font-weight:600;" : ""
        }">${escapeHtml(formatMoney(amount))}</td>` +
        `</tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#18181b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;">Todo con un Solo Proveedor</p>
<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;">Su contrato ${escapeHtml(data.folio)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Estimado(a) ${escapeHtml(data.clientName)}:</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Agradecemos sinceramente la confianza que deposita en nosotros al elegirnos como su proveedor de servicios para este evento tan especial.</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Adjuntamos su contrato ${escapeHtml(data.folio)}, correspondiente a su ${escapeHtml(eventLabel)} del ${escapeHtml(eventDate)}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;">${amountRows}</table>
<p style="margin:0 0 24px;"><a href="${escapeHtml(data.viewerUrl)}" style="display:inline-block;padding:12px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;">Ver el contrato en línea</a></p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#52525b;">Si el botón no funciona, copie este enlace en su navegador:<br><span style="font-family:Menlo,Consolas,monospace;font-size:12px;word-break:break-all;">${escapeHtml(data.viewerUrl)}</span></p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Si algún dato requiere corrección, escríbanos a <a href="mailto:info@todoconunsoloproveedor.com" style="color:#18181b;">info@todoconunsoloproveedor.com</a> o contáctenos por WhatsApp.</p>
<p style="margin:0;font-size:15px;line-height:1.6;">Atentamente,<br>Todo con un Solo Proveedor</p>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

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
 * Sends the contract to `clientEmail` with the OFFICIAL contract JPEG
 * attached and the public viewer link in the body, then sets
 * `contracts.emailSent`. Never throws for a configuration or API failure
 * (spec §4.2) — the confirm pipeline and the retry action both read the
 * returned result instead.
 *
 * Attachment AND link, not one or the other (D3): the attachment is what the
 * legacy system sent and what a client forwards or prints, while the link is
 * what stays correct after a regeneration and is the same URL ManyChat sends
 * over WhatsApp. Only the `"contract"` variant is ever sent — the
 * pre-contract render exists for the business's own Drive archive, never for
 * the client.
 *
 * Idempotency (spec §4.2 step 5, "no duplicate emails"): an early return on
 * `emailSent === true`. Unlike Drive, there is no per-artifact id to check
 * and no way to un-send, so the flag is the only guard — which is why the
 * flag is written only after Resend has accepted the message.
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
      eventType: true,
      eventDate: true,
      total: true,
      deposit: true,
      balance: true,
      viewerToken: true,
      emailSent: true,
    },
  });
  if (!contract) {
    return { ok: false, message: "Contrato no encontrado." };
  }

  if (contract.emailSent) {
    return { ok: true };
  }

  if (!contract.clientEmail) {
    return {
      ok: false,
      message: "El contrato no tiene correo del cliente; no hay a dónde enviarlo.",
    };
  }

  let from: string;
  let viewerUrl: string;
  try {
    from = resendFromAddress();
    viewerUrl = contractViewerUrl(contract.viewerToken);
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

  const message = buildContractEmail({
    folio: contract.folio,
    clientName: contract.clientName,
    eventType: contract.eventType,
    eventDate: contract.eventDate,
    total: Number(contract.total),
    deposit: Number(contract.deposit),
    balance: Number(contract.balance),
    viewerUrl,
  });

  let response: Awaited<ReturnType<Resend["emails"]["send"]>>;
  try {
    response = await resendClient().emails.send({
      from,
      to: contract.clientEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
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

  await prisma.contract.update({
    where: { id: contractId },
    data: { emailSent: true },
  });

  return { ok: true };
}
