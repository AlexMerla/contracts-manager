import { z } from "zod";

import {
  contractDataSchema,
  orderLineSchema,
  serviceSelectionSchema,
} from "@/lib/contracts/order-schemas";

// The ANONYMOUS confirm payload. This is a separate schema from
// `createContractPayloadSchema`, not an extension of it, and the difference is
// the whole security story of this change:
//
//   NO `discount`        — always written as null
//   NO `extraCharge`     — always written as null
//   NO `deposit`         — always `calculateDefaultDeposit(total, thresholds)`
//   NO `priceListId`     — always the single list flagged `isPublic`
//   NO `createdById`     — always the seeded house user
//
// zod strips unrecognized keys by default, so a caller that POSTs
// `{ deposit: 0, priceListId: "<a cheaper list>" }` has those keys dropped at
// parse time; they are not merely ignored downstream, they never reach the
// action's `data`. The only things the client gets to choose are the choices:
// which packages, how many, which service options, and the contract data.
export const createPublicPreContractSchema = z.object({
  orderLines: z.array(orderLineSchema).min(1, "Agregue al menos un paquete a su pedido."),
  serviceSelections: z.array(serviceSelectionSchema),
  contractData: contractDataSchema,
  /** Cloudflare Turnstile client token, verified server-side before any
   * database work begins (public-precontract Q3). */
  turnstileToken: z.string().min(1, "Complete la verificación de seguridad."),
});

export type CreatePublicPreContractPayload = z.infer<typeof createPublicPreContractSchema>;
