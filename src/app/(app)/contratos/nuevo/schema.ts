import { z } from "zod";

import {
  contractDataSchema,
  orderLineSchema,
  serviceSelectionSchema,
} from "@/lib/contracts/order-schemas";

// The field-level schemas moved to `@/lib/contracts/order-schemas` when the
// public pre-contract flow needed the same client-data validation without
// importing out of this route group. Re-exported here so every existing
// import of `contractDataSchema` / `ContractDataFormValues` keeps working
// unchanged (spec §3: "share zod schemas between client and server").
export { contractDataSchema };
export type { ContractDataFormValues } from "@/lib/contracts/order-schemas";

// The full confirm-and-create payload (spec §8 step 6 / sprint-04 task 6).
// Deliberately has NO `createdById` field — the server action always sets it
// from the authenticated session (sprint-04 task 7), so there is nothing for
// a spoofed client value to overwrite even if one were sent: zod strips
// unrecognized keys from the parsed result by default.
//
// NOT reusable by the public flow: `discount`, `extraCharge`, `deposit` and
// `priceListId` are client-supplied numbers/ids that `createContract` trusts
// verbatim. That is correct for an authenticated staff user and a security
// hole on an anonymous endpoint — see `src/app/precontrato/schema.ts`.
export const createContractPayloadSchema = z.object({
  priceListId: z.string().uuid(),
  orderLines: z.array(orderLineSchema).min(1, "Agregue al menos un paquete al pedido."),
  serviceSelections: z.array(serviceSelectionSchema),
  contractData: contractDataSchema,
  discount: z.number().min(0).nullable(),
  extraCharge: z.number().min(0).nullable(),
  deposit: z.number().min(0),
});

export type CreateContractPayload = z.infer<typeof createContractPayloadSchema>;

// edit-precontract (spec §8.2) — the edit payload. Derived from the create
// payload so the two can never disagree on a field's validation, minus
// `priceListId` (immutable on an existing contract) plus the target id.
// `folio`, `viewerToken`, `createdById` are not declared, so zod strips any
// supplied value before `updateContract` ever sees it (spec R3).
export const updateContractPayloadSchema = createContractPayloadSchema
  .omit({ priceListId: true })
  .extend({
    contractId: z.string().uuid(),
    orderLines: z.array(orderLineSchema).min(1, "El contrato debe incluir al menos un paquete."),
  });

export type UpdateContractPayload = z.infer<typeof updateContractPayloadSchema>;
