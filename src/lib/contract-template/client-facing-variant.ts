import type { ContractStatus } from "@/generated/prisma/client";

import type { ContractTemplateVariant } from "./generate-contract-image";

/** What the CLIENT sees for a contract: which template is rendered and the
 * Spanish word every client-facing surface uses for it (filename, page
 * title, heading, alt text). */
export interface ClientFacingImage {
  variant: ContractTemplateVariant;
  label: "Precontrato" | "Contrato";
}

const PRE_CONTRACT: ClientFacingImage = {
  variant: "pre-contract",
  label: "Precontrato",
};
const CONTRACT: ClientFacingImage = { variant: "contract", label: "Contrato" };

// Spec §7 — the single source of truth for "which image does the client get".
// Keyed by the CURRENT `contractStatus`, read at request/send time and never
// cached on the row, so confirming a contract switches every client channel
// over without any re-send or regeneration step (spec §4.2: nothing is sent
// automatically on a status change). `cancelled` maps to `null`: a cancelled
// contract has NO client-facing image at all — the viewer page and its image
// route 404, and email/WhatsApp refuse to send. A `Record` (not a `switch`)
// so adding a new enum value is a compile error until it is mapped here.
const CLIENT_FACING_IMAGE = {
  pre_contract: PRE_CONTRACT,
  confirmed: CONTRACT,
  completed: CONTRACT,
  cancelled: null,
} as const satisfies Record<ContractStatus, ClientFacingImage | null>;

export function clientFacingImage(status: ContractStatus): ClientFacingImage | null {
  return CLIENT_FACING_IMAGE[status];
}

/** `Precontrato<folio>.jpg` / `Contrato<folio>.jpg` — the same naming the
 * Drive copies use (`contractDriveFileName`), so the client's attachment and
 * the business's archive file carry the same name. */
export function clientFacingImageFileName(image: ClientFacingImage, folio: string): string {
  return `${image.label}${folio}.jpg`;
}
