import { Resend } from "resend";

// Shared Resend plumbing for every email this app sends (the contract email
// and the payment receipt). Extracted from contract-email.ts unchanged when
// payment-receipt added the second sender — see that module's header for why
// the official SDK is used here and plain `fetch` for HighLevel.

/** Required because an unverified sender silently bounces every delivery —
 * there is no safe default to fall back to. */
export function resendFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    throw new Error(
      "RESEND_FROM_EMAIL no está configurada. Defina el remitente verificado en Resend " +
        '(por ejemplo "Todo con un Solo Proveedor <contratos@sudominio.com>").'
    );
  }
  return from;
}

export function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY no está configurada; no se puede enviar el correo.");
  }
  // Constructed per call rather than memoised: at ~2 contracts/week (§4.2)
  // the allocation is free, and it removes any chance of holding a client
  // built from a rotated key.
  return new Resend(apiKey);
}
