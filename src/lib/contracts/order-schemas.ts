import { z } from "zod";

// Field-level zod schemas shared by BOTH the authenticated wizard
// (`src/app/(app)/contratos/nuevo/schema.ts`) and the public pre-contract flow
// (`src/app/precontrato/schema.ts`).
//
// Only the *data* schemas live here. The two full payload schemas stay apart
// on purpose: the wizard's accepts `discount` / `extraCharge` / `deposit` /
// `priceListId` as client input (a staff user is trusted to set them), and the
// public one must never have those fields at all. Sharing the envelope is
// exactly the mistake this split exists to prevent.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every field maps 1:1 to a nullable `contracts` column (spec §6.4) — empty
 * string on the wire becomes `null` on write, never an empty string in the
 * database. */
export const contractDataSchema = z.object({
  clientName: z.string().min(1, "Ingrese el nombre del cliente."),
  clientPhone: z.string(),
  clientMobile: z.string().min(1, "Ingrese el celular."),
  clientEmail: z
    .string()
    .min(1, "Ingrese el correo.")
    .refine((value) => EMAIL_PATTERN.test(value), "Ingrese un correo válido."),
  clientAddress: z.string(),
  eventType: z.enum(["quinceanera", "wedding", "birthday", "graduation", "posada", "other"], {
    message: "Seleccione el tipo de evento.",
  }),
  celebrated: z.string(),
  eventDate: z.string().min(1, "Seleccione la fecha del evento."),
  eventTime: z.string(),
  placeName: z.string(),
  placeAddress: z.string(),
});

export type ContractDataFormValues = z.infer<typeof contractDataSchema>;

export const orderLineSchema = z.object({
  packageId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export const serviceSelectionSchema = z.object({
  serviceId: z.string().uuid(),
  selectedOption: z.string().min(1),
});
