import { formatMoney } from "@/lib/contract-template/format-money";
import {
  stepErrorMessage,
  type ContractDeliveryStepResult,
} from "@/lib/contracts/delivery-step";
import { receiptFileName, type ReceiptSnapshot } from "@/lib/payment-receipt/snapshot";

import { resendClient, resendFromAddress } from "./resend-client";

import type { Resend } from "resend";

// payment-receipt R3 — the receipt email. Same shape as the contract email:
// copy lives in a Resend dashboard Template the business edits itself, the
// JPEG is attached. The template id is configuration (RESEND_RECEIPT_TEMPLATE_ID),
// not a code constant, because the business creates that template outside
// the repo after this ships.
//
// Text-only variables, NO link/href variable: Resend's REST API mangles a
// template variable used inside an HTML attribute (resend/react-email#3247),
// and the receipt itself is attached anyway.

function receiptTemplateId(): string {
  const id = process.env.RESEND_RECEIPT_TEMPLATE_ID?.trim();
  if (!id) {
    throw new Error("Falta configurar RESEND_RECEIPT_TEMPLATE_ID para enviar el comprobante por correo.");
  }
  return id;
}

/** "Liquidado" once nothing is owed, matching the printed receipt. */
export function receiptBalanceText(snapshot: ReceiptSnapshot): string {
  return snapshot.balanceCents === 0 ? "Liquidado" : formatMoney(snapshot.balanceCents / 100);
}

export interface ReceiptEmailMessage {
  to: string;
  snapshot: ReceiptSnapshot;
  image: Buffer;
}

/** Plain data in, no database — the caller (payment-receipt/delivery.ts)
 * loads the payment, applies the cancelled/contact guards and flips the
 * status column. Never throws. */
export async function sendReceiptEmailMessage(
  message: ReceiptEmailMessage
): Promise<ContractDeliveryStepResult> {
  let from: string;
  let templateId: string;
  try {
    from = resendFromAddress();
    templateId = receiptTemplateId();
  } catch (error: unknown) {
    return { ok: false, message: stepErrorMessage(error) };
  }

  const { snapshot } = message;
  let response: Awaited<ReturnType<Resend["emails"]["send"]>>;
  try {
    response = await resendClient().emails.send({
      from,
      to: message.to,
      template: {
        id: templateId,
        variables: {
          CLIENT_NAME: snapshot.clientName,
          PAYMENT_FOLIO: snapshot.paymentFolio,
          AMOUNT: formatMoney(snapshot.amountCents / 100),
          BALANCE: receiptBalanceText(snapshot),
        },
      },
      attachments: [
        {
          filename: receiptFileName(snapshot.paymentFolio),
          content: message.image,
          contentType: "image/jpeg",
        },
      ],
    });
  } catch (error: unknown) {
    return { ok: false, message: `No se pudo enviar el comprobante por correo: ${stepErrorMessage(error)}` };
  }

  if (response.error) {
    return { ok: false, message: `No se pudo enviar el comprobante por correo: ${response.error.message}` };
  }

  console.log(
    `Resend accepted receipt ${snapshot.paymentFolio}'s email (id ${response.data?.id ?? "unknown"}).`
  );
  return { ok: true };
}
