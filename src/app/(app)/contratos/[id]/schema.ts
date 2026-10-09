import { z } from "zod";

import { PAYMENT_CONCEPTS, PAYMENT_METHODS } from "@/lib/payments/labels";

// Shared between the client dialog (react-hook-form validation) and the
// server action's re-validation — same pattern as
// src/app/(app)/contratos/nuevo/schema.ts's contractDataSchema (spec §3:
// "share zod schemas between client and server validation").
//
// `amount` arrives as a string from `MoneyInput` (design: money-input.tsx
// hands back the raw, unformatted string the user typed) and is coerced
// here; the dialog is responsible for feeding it a numeric-looking string.
export const registerPaymentSchema = z.object({
  contractId: z.string().uuid(),
  amount: z.coerce.number().positive("Ingrese un monto mayor a cero."),
  method: z.enum(PAYMENT_METHODS, { message: "Seleccione un método de pago." }),
  concept: z.enum(PAYMENT_CONCEPTS, { message: "Seleccione un concepto." }),
  paymentDate: z.string().min(1, "Seleccione la fecha del pago."),
  note: z.string(),
});

// Output type (post-coercion) — what `registerPayment` (the server action)
// receives and what `handleSubmit`'s callback receives once react-hook-form
// has run the zod resolver.
export type RegisterPaymentValues = z.infer<typeof registerPaymentSchema>;

// Input type (pre-coercion) — `amount: z.coerce.number()` accepts `unknown`
// on the way in (MoneyInput hands back a raw, unformatted string), so this
// is the type `useForm` itself is instantiated with; see
// register-payment-dialog.tsx's three-generic `useForm<Input, Context,
// Output>` call.
export type RegisterPaymentFormInput = z.input<typeof registerPaymentSchema>;

export const addNoteSchema = z.object({
  contractId: z.string().uuid(),
  text: z.string().trim().min(1, "Escriba una nota antes de guardar."),
});

export type AddNoteValues = z.infer<typeof addNoteSchema>;

// Spec §6.4 / §12 item 5: `cancellation_reason` is "required when
// contract_status = cancelled", so the reason is not an optional note — it is
// the only field of the action, and the mandatory typed justification IS the
// deliberate act (see cancel-contract-dialog.tsx). Trimmed before `min(1)` so
// a whitespace-only reason is rejected on BOTH sides, same as `addNoteSchema`.
export const cancelContractSchema = z.object({
  contractId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "Escriba el motivo de la cancelación.")
    .max(500, "El motivo no puede exceder los 500 caracteres."),
});

export type CancelContractValues = z.infer<typeof cancelContractSchema>;
