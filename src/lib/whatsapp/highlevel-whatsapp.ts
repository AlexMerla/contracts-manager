import { contractViewerUrl } from "@/lib/app-url";
import { clientFacingImage } from "@/lib/contract-template/client-facing-variant";
import { formatMoney } from "@/lib/contract-template/format-money";
import {
  stepErrorMessage,
  type ContractDeliveryStepResult,
} from "@/lib/contracts/delivery-step";
import {
  addContactToWorkflow,
  setNewContactName,
  upsertContact,
  type HighLevelCustomField,
} from "@/lib/highlevel/client";
import { readHighLevelConfig, type HighLevelFlow } from "@/lib/highlevel/config";
import { normalizeMexicanMobile } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

// highlevel-whatsapp R2/R3/R4 — WhatsApp delivery through HighLevel (ru42).
// The app never sends a WhatsApp message itself: it writes its OWN custom
// fields on the client's contact (matched by phone) and enrolls the contact
// in a dedicated workflow whose only action sends a Meta-approved template
// built from those fields. The only client-facing payload is a LINK built
// from `viewer_token` / `receipt_token` (spec §10) — never an image (that
// works only inside WhatsApp's 24 h window) and never an internal id.
//
// "Sent" means "enrolled in the workflow", not delivered or read: delivery is
// confirmed in ru42. One template and one workflow serve every contract status
// (decision `highlevel-contract-template`): the viewer link already shows the
// right image for the status at open time.

export const WHATSAPP_CANCELLED_MESSAGE = "No se puede enviar por WhatsApp un contrato cancelado.";
export const WHATSAPP_NO_MOBILE_MESSAGE = "El cliente no tiene un celular válido para WhatsApp.";
export const WHATSAPP_NOT_CONFIGURED_MESSAGE = "WhatsApp (HighLevel) no está configurado.";

/** Keys of the contact custom fields the business created in ru42 for this
 * app (folder "Sistema de contratos"). The ONLY fields this app ever writes. */
export const CONTRACT_FIELD_KEYS = {
  clientName: "contrato_cliente",
  folio: "contrato_folio",
  link: "contrato_link",
} as const;

export const RECEIPT_FIELD_KEYS = {
  clientName: "comprobante_cliente",
  folio: "comprobante_folio",
  amount: "comprobante_monto",
  balance: "comprobante_saldo",
  link: "comprobante_link",
} as const;

/** "$1,500.00 MXN" — the same `formatMoney` the receipt image and email use,
 * plus the currency code, because a WhatsApp text has no other context. */
export function whatsAppMoney(cents: number): string {
  return `${formatMoney(cents / 100)} MXN`;
}

/** "Liquidado" once nothing is owed, matching the printed receipt
 * (`receiptBalanceText`). */
export function whatsAppBalance(balanceCents: number): string {
  return balanceCents === 0 ? "Liquidado" : whatsAppMoney(balanceCents);
}

interface WorkflowDelivery {
  flow: HighLevelFlow;
  /** Raw `clientMobile` as stored; normalized here. */
  phone: string | null;
  clientName: string;
  fields: HighLevelCustomField[];
}

/**
 * Shared by both flows. Guards run before ANY external call, in spec order
 * (the caller has already refused a cancelled contract): no valid mobile →
 * incomplete configuration. Then upsert → (name, only for a contact WE just
 * created) → enrollment. Never throws (every HighLevel call returns a value).
 */
async function deliverThroughWorkflow(delivery: WorkflowDelivery): Promise<ContractDeliveryStepResult> {
  const phone = delivery.phone ? normalizeMexicanMobile(delivery.phone) : null;
  if (!phone) {
    return { ok: false, message: WHATSAPP_NO_MOBILE_MESSAGE };
  }
  const config = readHighLevelConfig(delivery.flow);
  if (!config) {
    return { ok: false, message: WHATSAPP_NOT_CONFIGURED_MESSAGE };
  }

  const contact = await upsertContact({
    token: config.token,
    locationId: config.locationId,
    phone,
    customFields: delivery.fields,
  });
  if (!contact.ok) {
    return { ok: false, message: contact.message };
  }

  if (contact.data.isNew) {
    const named = await setNewContactName({
      token: config.token,
      contactId: contact.data.contactId,
      name: delivery.clientName,
    });
    // S1.7: the template greets with our own `*_cliente` field, not the
    // contact's name, so a failed name write is not a delivery failure.
    if (!named.ok) {
      console.error(`HighLevel ${delivery.flow} WhatsApp: new contact's name was not saved`);
    }
  }

  const enrolled = await addContactToWorkflow({
    token: config.token,
    contactId: contact.data.contactId,
    workflowId: config.workflowId,
  });
  return enrolled.ok ? { ok: true } : { ok: false, message: enrolled.message };
}

export interface ContractWhatsAppMessage {
  phone: string | null;
  clientName: string;
  folio: string;
  /** Absolute public viewer URL, built from `viewerToken` (spec §10). */
  viewerUrl: string;
}

/** Plain data in, no database — unit-tested against a mocked `fetch`. */
export async function sendContractWhatsAppMessage(
  message: ContractWhatsAppMessage
): Promise<ContractDeliveryStepResult> {
  return deliverThroughWorkflow({
    flow: "contract",
    phone: message.phone,
    clientName: message.clientName,
    fields: [
      { key: CONTRACT_FIELD_KEYS.clientName, field_value: message.clientName },
      { key: CONTRACT_FIELD_KEYS.folio, field_value: message.folio },
      { key: CONTRACT_FIELD_KEYS.link, field_value: message.viewerUrl },
    ],
  });
}

/**
 * Spec §4.2 step 5 and the "Reintentar / Reenviar por WhatsApp" actions.
 * Refuses a cancelled contract before anything else (its viewer 404s), then
 * sends and sets `contracts.whatsapp_sent = true` on enrollment. Never throws
 * for a configuration or HighLevel failure; the flag is left as it was.
 */
export async function sendContractWhatsApp(contractId: string): Promise<ContractDeliveryStepResult> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { folio: true, clientName: true, clientMobile: true, viewerToken: true, contractStatus: true },
  });
  if (!contract) {
    return { ok: false, message: "Contrato no encontrado." };
  }
  if (!clientFacingImage(contract.contractStatus)) {
    return { ok: false, message: WHATSAPP_CANCELLED_MESSAGE };
  }

  let viewerUrl: string;
  try {
    viewerUrl = contractViewerUrl(contract.viewerToken);
  } catch (error: unknown) {
    return { ok: false, message: stepErrorMessage(error) };
  }

  const sent = await sendContractWhatsAppMessage({
    phone: contract.clientMobile,
    clientName: contract.clientName,
    folio: contract.folio,
    viewerUrl,
  });
  if (!sent.ok) {
    return sent;
  }
  await prisma.contract.update({ where: { id: contractId }, data: { whatsappSent: true } });
  return { ok: true };
}

export interface ReceiptWhatsAppMessage {
  phone: string | null;
  clientName: string;
  /** The PAYMENT folio, e.g. `PG-0007` (`comprobante_folio`). */
  paymentFolio: string;
  amountCents: number;
  /** Balance right after this payment, from the frozen snapshot. */
  balanceCents: number;
  /** Absolute public receipt URL, built from `receiptToken` (spec §10). */
  receiptUrl: string;
}

/** Plain data in, no database. The caller (payment-receipt/delivery.ts)
 * refuses a cancelled contract and flips `receipt_whatsapp_sent`. */
export async function sendReceiptWhatsAppMessage(
  message: ReceiptWhatsAppMessage
): Promise<ContractDeliveryStepResult> {
  return deliverThroughWorkflow({
    flow: "receipt",
    phone: message.phone,
    clientName: message.clientName,
    fields: [
      { key: RECEIPT_FIELD_KEYS.clientName, field_value: message.clientName },
      { key: RECEIPT_FIELD_KEYS.folio, field_value: message.paymentFolio },
      { key: RECEIPT_FIELD_KEYS.amount, field_value: whatsAppMoney(message.amountCents) },
      { key: RECEIPT_FIELD_KEYS.balance, field_value: whatsAppBalance(message.balanceCents) },
      { key: RECEIPT_FIELD_KEYS.link, field_value: message.receiptUrl },
    ],
  });
}
