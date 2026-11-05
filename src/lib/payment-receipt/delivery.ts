import { paymentReceiptViewerUrl } from "@/lib/app-url";
import {
  stepErrorMessage,
  type ContractDeliveryStepResult,
} from "@/lib/contracts/delivery-step";
import { sendReceiptEmailMessage } from "@/lib/email/receipt-email";
import { prisma } from "@/lib/prisma";
import { sendReceiptWhatsAppMessage } from "@/lib/whatsapp/highlevel-whatsapp";

import { generateReceiptImage } from "./generate-receipt-image";
import { parseReceiptSnapshot, type ReceiptSnapshot } from "./snapshot";

// payment-receipt R2/R3/R4/R7 — the two client channels for a receipt. Same
// discipline as the contract pipeline (spec §4.2): sequential, in-process, no
// queue; every step converts its own failure into a value and NEVER throws, so
// a Resend outage can't stop the WhatsApp step and neither can fail the
// payment. Success flips the step's status column; nothing else is written.
// There is no Drive step and never will be (R8).

export type ReceiptChannel = "email" | "whatsapp";

export const RECEIPT_CHANNELS = ["email", "whatsapp"] as const satisfies readonly ReceiptChannel[];

export const RECEIPT_CHANNEL_LABEL: Record<ReceiptChannel, string> = {
  email: "correo",
  whatsapp: "WhatsApp",
};

export const RECEIPT_CANCELLED_MESSAGE = "El contrato está cancelado; no se envía al cliente.";
export const RECEIPT_NOT_FOUND_MESSAGE = "No se encontró el pago.";
const NO_RECEIPT_MESSAGE = "Este pago se registró antes de los comprobantes; no tiene comprobante.";
const RENDER_FAILED_MESSAGE = "No se pudo generar el comprobante.";

interface ReceiptDeliveryContext {
  snapshot: ReceiptSnapshot;
  receiptToken: string;
  clientEmail: string | null;
  clientMobile: string | null;
}

type ContextResult = { ok: true; context: ReceiptDeliveryContext } | { ok: false; message: string };

/** Loads what a step needs and applies the guards shared by both channels, in
 * this order: unknown payment, cancelled contract (checked before ANY
 * configuration or external work — R7), no snapshot. The client's contact
 * data is read live: it says where to send, it is not printed content. */
async function loadContext(paymentId: string): Promise<ContextResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      receiptToken: true,
      receiptSnapshot: true,
      contract: { select: { contractStatus: true, clientEmail: true, clientMobile: true } },
    },
  });
  if (!payment) {
    return { ok: false, message: RECEIPT_NOT_FOUND_MESSAGE };
  }
  if (payment.contract.contractStatus === "cancelled") {
    return { ok: false, message: RECEIPT_CANCELLED_MESSAGE };
  }
  const snapshot = parseReceiptSnapshot(payment.receiptSnapshot);
  if (!snapshot) {
    return { ok: false, message: NO_RECEIPT_MESSAGE };
  }
  return {
    ok: true,
    context: {
      snapshot,
      receiptToken: payment.receiptToken,
      clientEmail: payment.contract.clientEmail,
      clientMobile: payment.contract.clientMobile,
    },
  };
}

async function sendEmailStep(paymentId: string): Promise<ContractDeliveryStepResult> {
  const loaded = await loadContext(paymentId);
  if (!loaded.ok) {
    return loaded;
  }
  const { snapshot, clientEmail } = loaded.context;
  if (!clientEmail) {
    return { ok: false, message: "El cliente no tiene correo." };
  }

  let image: Buffer;
  try {
    image = await generateReceiptImage(snapshot);
  } catch (error: unknown) {
    console.error(`Failed to render receipt ${snapshot.paymentFolio}:`, error);
    return { ok: false, message: RENDER_FAILED_MESSAGE };
  }

  const sent = await sendReceiptEmailMessage({ to: clientEmail, snapshot, image });
  if (!sent.ok) {
    return sent;
  }
  await prisma.payment.update({ where: { id: paymentId }, data: { receiptEmailSent: true } });
  return { ok: true };
}

/** highlevel-whatsapp R3 — un-paused. The cancelled guard ran in
 * `loadContext`; the mobile and configuration guards run inside
 * `sendReceiptWhatsAppMessage`, all before any HighLevel call. */
async function sendWhatsAppStep(paymentId: string): Promise<ContractDeliveryStepResult> {
  const loaded = await loadContext(paymentId);
  if (!loaded.ok) {
    return loaded;
  }
  const { snapshot, receiptToken, clientMobile } = loaded.context;

  let receiptUrl: string;
  try {
    receiptUrl = paymentReceiptViewerUrl(receiptToken);
  } catch (error: unknown) {
    return { ok: false, message: stepErrorMessage(error) };
  }

  // Every printed value comes from the frozen snapshot (R1), never live data.
  const sent = await sendReceiptWhatsAppMessage({
    phone: clientMobile,
    clientName: snapshot.clientName,
    paymentFolio: snapshot.paymentFolio,
    amountCents: snapshot.amountCents,
    balanceCents: snapshot.balanceCents,
    receiptUrl,
  });
  if (!sent.ok) {
    return sent;
  }
  await prisma.payment.update({ where: { id: paymentId }, data: { receiptWhatsappSent: true } });
  return { ok: true };
}

const STEPS: Record<ReceiptChannel, (paymentId: string) => Promise<ContractDeliveryStepResult>> = {
  email: sendEmailStep,
  whatsapp: sendWhatsAppStep,
};

/** One channel for one payment — the "Reenviar comprobante" action and the
 * post-commit delivery both come through here. Never throws: an unexpected
 * error (e.g. the database dropping mid-step) becomes the step's failure. */
export async function sendPaymentReceipt(
  paymentId: string,
  channel: ReceiptChannel
): Promise<ContractDeliveryStepResult> {
  try {
    return await STEPS[channel](paymentId);
  } catch (error: unknown) {
    console.error(`Receipt ${channel} step failed for payment ${paymentId}:`, error);
    return { ok: false, message: `No se pudo enviar el comprobante por ${RECEIPT_CHANNEL_LABEL[channel]}: ${stepErrorMessage(error)}` };
  }
}

export interface ReceiptDeliveryFailure {
  channel: ReceiptChannel;
  message: string;
}

/** Post-commit delivery after registerPayment (R2): email, then WhatsApp,
 * each attempted regardless of the other's outcome. Returns only the
 * failures — an empty list means the receipt reached both channels. */
export async function runPaymentReceiptDelivery(paymentId: string): Promise<ReceiptDeliveryFailure[]> {
  const failures: ReceiptDeliveryFailure[] = [];
  for (const channel of RECEIPT_CHANNELS) {
    const result = await sendPaymentReceipt(paymentId, channel);
    if (!result.ok) {
      console.error(`Receipt ${channel} not sent for payment ${paymentId}: ${result.message}`);
      failures.push({ channel, message: result.message });
    }
  }
  return failures;
}
