import { z } from "zod";

// Shared between the client wizard (step 4's react-hook-form validation) and
// the server action's re-validation (spec §3: "share zod schemas between
// client and server validation"). Every field here maps 1:1 to a nullable
// `contracts` column (spec §6.4) — empty string on the wire becomes `null`
// on write, never an empty string in the database.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const contractDataSchema = z.object({
  clientName: z.string().min(1, "Ingrese el nombre del cliente."),
  clientPhone: z.string(),
  clientMobile: z.string(),
  clientEmail: z
    .string()
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), "Ingrese un correo válido."),
  clientAddress: z.string(),
  eventType: z.string().min(1, "Ingrese el tipo de evento."),
  celebrated: z.string(),
  eventDate: z.string().min(1, "Seleccione la fecha del evento."),
  eventTime: z.string(),
  placeName: z.string(),
  placeAddress: z.string(),
});

export type ContractDataFormValues = z.infer<typeof contractDataSchema>;

const orderLineSchema = z.object({
  packageId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const serviceSelectionSchema = z.object({
  serviceId: z.string().uuid(),
  selectedOption: z.string().min(1),
});

// The full confirm-and-create payload (spec §8 step 6 / sprint-04 task 6).
// Deliberately has NO `createdById` field — the server action always sets it
// from the authenticated session (sprint-04 task 7), so there is nothing for
// a spoofed client value to overwrite even if one were sent: zod strips
// unrecognized keys from the parsed result by default.
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
