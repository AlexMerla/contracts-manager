// Sprint-07 / spec §10 — the single source of truth for the app's own public
// origin and for the `/contracts/view/[viewerToken]` link built from it.
//
// Why an explicit env var (D1):
//  * The link is produced inside `createContract`, a Server Action. Unlike a
//    route handler (`src/app/api/google/connect/route.ts`, which derives its
//    origin from `request.url` via `googleRedirectUri`), an action has no
//    `Request` in hand.
//  * `headers()` IS readable from a Server Action, but the only origin it can
//    offer comes from `Host`/`X-Forwarded-Host` — client-controlled input. A
//    poisoned header would put an attacker's domain into an email and a
//    WhatsApp message sent in the business's name. Those two outputs leave the
//    system permanently; they are exactly the place not to trust a request
//    header.
//  * An env var is also the pattern this project already uses for new
//    deployment-level configuration (`TOKEN_ENCRYPTION_KEY`,
//    `GOOGLE_MASTER_CLIENT_ID`, the optional `GOOGLE_DRIVE_FOLDER_ID`), and it
//    is the only option that yields the SAME link from a Server Action, a
//    route handler and a background retry.
//
// Rejected alternative: `VERCEL_PROJECT_PRODUCTION_URL` as an automatic
// fallback. It is Vercel-only, it is absent in local dev and in `vitest`, and
// on a preview deployment it silently points at production — a confusing
// failure mode. An explicit, required variable fails loudly instead.

import type { ContractTemplateVariant } from "@/lib/contract-template/generate-contract-image";

/** Spanish, operator-facing — surfaces through a delivery step's `message`. */
const MISSING =
  "APP_BASE_URL no está configurada. Defina la URL pública de la aplicación " +
  "(por ejemplo https://contratos.ejemplo.com) para poder generar el enlace del contrato.";

/**
 * The configured public origin, with no trailing slash (`new URL().origin`
 * normalises that, plus the default port and the casing of the host).
 *
 * @throws when `APP_BASE_URL` is missing or is not an absolute http(s) URL.
 * Every caller that runs inside a delivery step catches this and reports it
 * as that step's failure message, per spec §4.2.
 */
export function appBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim();
  if (!raw) {
    throw new Error(MISSING);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`APP_BASE_URL no es una URL válida: "${raw}".`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`APP_BASE_URL debe empezar con http:// o https:// (recibido "${raw}").`);
  }

  return parsed.origin;
}

/** Path-only form of the public viewer route (spec §10). Useful where the
 * origin is implicit — e.g. the `<img src>` inside the viewer page itself. */
export function contractViewerPath(viewerToken: string): string {
  return `/contracts/view/${encodeURIComponent(viewerToken)}`;
}

/** The viewer's image route, versioned by WHAT the page is about to show:
 * the variant plus the contract's `updatedAt`. The route itself ignores `v`
 * and always renders from the contract's CURRENT stored data; the query
 * string exists only so a status change (pre-contract → contract) or an edit
 * (edit-precontract) yields a new URL, and the browser's `private,
 * max-age=300` copy of the old image can never be shown under the new page.
 * `updatedAt` is base-36 encoded — opaque, short, and still monotonic. */
export function contractViewerImagePath(
  viewerToken: string,
  variant: ContractTemplateVariant,
  updatedAt: Date
): string {
  return `${contractViewerPath(viewerToken)}/image?v=${variant}.${updatedAt.getTime().toString(36)}`;
}

/** Absolute public viewer URL — what goes in the email body and in the
 * HighLevel `contrato_link` custom field. Always built from `viewerToken`, never from the
 * internal `id` (spec §6.4, §10). */
export function contractViewerUrl(viewerToken: string): string {
  return `${appBaseUrl()}${contractViewerPath(viewerToken)}`;
}

/** Non-throwing variant for UI that must render even when the deployment is
 * misconfigured — the contract detail page shows the copy-link control
 * (sprint-07 task 5) rather than 500ing on a missing env var. */
export function tryContractViewerUrl(viewerToken: string): string | null {
  try {
    return contractViewerUrl(viewerToken);
  } catch {
    return null;
  }
}

/** payment-receipt — public receipt viewer page (spec §10). Built from
 * `payments.receipt_token` only, never the payment's internal id. */
export function paymentReceiptViewerPath(receiptToken: string): string {
  return `/comprobantes/view/${encodeURIComponent(receiptToken)}`;
}

/** The receipt's JPEG route. Unversioned on purpose: a receipt is rendered
 * from a frozen snapshot, so the bytes behind a token never change. */
export function paymentReceiptImagePath(receiptToken: string): string {
  return `${paymentReceiptViewerPath(receiptToken)}/image`;
}

/** Absolute receipt URL — what the HighLevel `comprobante_link` field carries.
 * @throws like `appBaseUrl` when `APP_BASE_URL` is missing or invalid. */
export function paymentReceiptViewerUrl(receiptToken: string): string {
  return `${appBaseUrl()}${paymentReceiptViewerPath(receiptToken)}`;
}

/** Staff-only download of a receipt, inside the authenticated app — the route
 * re-checks the session and `scopeToOwner`. Relative: it is only ever linked
 * from the contract detail page. */
export function paymentReceiptDownloadPath(contractId: string, paymentId: string): string {
  return `/contratos/${encodeURIComponent(contractId)}/pagos/${encodeURIComponent(paymentId)}/comprobante`;
}
