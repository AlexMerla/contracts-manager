"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_CONCEPT_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/payments/labels";
import type { ReceiptDeliveryFailure } from "@/lib/payment-receipt/delivery";

import { registerPayment } from "./actions";
import {
  registerPaymentSchema,
  type RegisterPaymentFormInput,
  type RegisterPaymentValues,
} from "./schema";

const today = () => new Date().toISOString().slice(0, 10);

const concepts = Object.entries(PAYMENT_CONCEPT_LABEL) as [
  RegisterPaymentValues["concept"],
  string,
][];
const methods = Object.entries(PAYMENT_METHOD_LABEL) as [
  RegisterPaymentValues["method"],
  string,
][];

const RECEIPT_CHANNEL_NAME: Record<ReceiptDeliveryFailure["channel"], string> = {
  email: "correo",
  whatsapp: "WhatsApp",
};

/** payment-receipt R2: the payment is recorded; this is what the dialog shows
 * instead of closing when at least one receipt channel failed. */
interface ReceiptOutcome {
  folio: string;
  failures: ReceiptDeliveryFailure[];
}

interface RegisterPaymentDialogProps {
  contractId: string;
  /** Current "saldo por cobrar" (total − SUM(payments)), for the dialog's
   * informational overpayment notice only — never written anywhere. */
  balanceDue: number;
  /** Renders either trigger from one implementation (design decision): the
   * header's compact button, or the sidebar's full-width one. */
  variant: "header" | "sidebar";
}

export function RegisterPaymentDialog({ contractId, balanceDue, variant }: RegisterPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Mirrors the amount field for the overpayment notice only — kept as
  // plain local state (rather than react-hook-form's `watch()`) because
  // `watch()` returns a function the React Compiler cannot safely memoize,
  // which the project's ESLint config flags (react-hooks/incompatible-library).
  const [liveAmount, setLiveAmount] = useState("");
  const [receiptOutcome, setReceiptOutcome] = useState<ReceiptOutcome | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPaymentFormInput, unknown, RegisterPaymentValues>({
    resolver: zodResolver(registerPaymentSchema),
    defaultValues: {
      contractId,
      amount: 0,
      method: "cash",
      concept: "deposit",
      paymentDate: today(),
      note: "",
      sendReceipt: true,
    },
  });

  const amountValue = Number(liveAmount);
  const overpays = balanceDue > 0 && !Number.isNaN(amountValue) && amountValue > balanceDue;

  async function onSubmit(values: RegisterPaymentValues) {
    setFormError(null);

    const result = await registerPayment(values);
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    reset({ ...values, amount: 0, note: "", paymentDate: today(), sendReceipt: true });
    setLiveAmount("");
    // The payment is recorded either way. A receipt that reached every
    // channel (or was never requested) needs no message — the new row and its
    // status badges say it; a failed channel keeps the dialog open to say
    // which, and where to retry.
    if (result.receiptFailures && result.receiptFailures.length > 0) {
      setReceiptOutcome({ folio: result.folio, failures: result.receiptFailures });
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
          setLiveAmount("");
          setFormError(null);
          setReceiptOutcome(null);
        }
      }}
    >
      <DialogTrigger
        render={
          variant === "header" ? (
            <Button type="button" size="sm" />
          ) : (
            <Button type="button" className="w-full" />
          )
        }
      >
        Registrar pago
      </DialogTrigger>
      <DialogContent>
        {receiptOutcome ? (
          <ReceiptOutcomeView outcome={receiptOutcome} />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>Registrar pago</DialogTitle>
            </DialogHeader>

            <FieldGroup className="mt-4">
              <Field data-invalid={!!errors.amount}>
                <FieldLabel htmlFor="amount">Monto</FieldLabel>
                <Controller
                  control={control}
                  name="amount"
                  render={({ field }) => (
                    <MoneyInput
                      id="amount"
                      value={String(field.value ?? "")}
                      onChange={(rawValue) => {
                        field.onChange(rawValue);
                        setLiveAmount(rawValue);
                      }}
                    />
                  )}
                />
                <FieldError errors={[errors.amount]} />
              </Field>

              <Field data-invalid={!!errors.paymentDate}>
                <FieldLabel htmlFor="paymentDate">Fecha</FieldLabel>
                <Input id="paymentDate" type="date" {...register("paymentDate")} />
                <FieldError errors={[errors.paymentDate]} />
              </Field>

              <Field data-invalid={!!errors.method}>
                <FieldLabel htmlFor="method">Método</FieldLabel>
                <Controller
                  control={control}
                  name="method"
                  render={({ field }) => (
                    <Select
                      items={PAYMENT_METHOD_LABEL}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="method" className="w-full">
                        <SelectValue placeholder="Seleccione un método" />
                      </SelectTrigger>
                      <SelectContent>
                        {methods.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.method]} />
              </Field>

              <Field data-invalid={!!errors.concept}>
                <FieldLabel htmlFor="concept">Concepto</FieldLabel>
                <Controller
                  control={control}
                  name="concept"
                  render={({ field }) => (
                    <Select
                      items={PAYMENT_CONCEPT_LABEL}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="concept" className="w-full">
                        <SelectValue placeholder="Seleccione un concepto" />
                      </SelectTrigger>
                      <SelectContent>
                        {concepts.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.concept]} />
              </Field>

              <Field data-invalid={!!errors.note}>
                <FieldLabel htmlFor="note">Referencia (opcional)</FieldLabel>
                <Textarea
                  id="note"
                  placeholder="Ej. número de transferencia, quién recibió el efectivo…"
                  {...register("note")}
                />
                <FieldError errors={[errors.note]} />
              </Field>

              <Field orientation="horizontal">
                <Controller
                  control={control}
                  name="sendReceipt"
                  render={({ field }) => (
                    <Checkbox
                      id="sendReceipt"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  )}
                />
                <FieldContent>
                  <FieldLabel htmlFor="sendReceipt" className="font-normal">
                    Enviar comprobante al cliente
                  </FieldLabel>
                  <FieldDescription>
                    Por correo y por WhatsApp. Si no lo envía ahora, puede hacerlo después desde Pagos.
                  </FieldDescription>
                </FieldContent>
              </Field>

              {overpays && (
                <Alert
                  tone="info"
                  icon={CircleAlert}
                  title="El monto supera el saldo pendiente"
                  description="El pago se registrará completo y el contrato quedará marcado como pagado en su totalidad."
                />
              )}

              {formError && (
                <p role="alert" className="text-sm font-normal text-destructive">
                  {formError}
                </p>
              )}
            </FieldGroup>

            <DialogFooter className="mt-4">
              <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Registrando…" : "Registrar pago"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptOutcomeView({ outcome }: { outcome: ReceiptOutcome }) {
  const channels = outcome.failures.map((failure) => RECEIPT_CHANNEL_NAME[failure.channel]).join(" ni por ");
  return (
    <>
      <DialogHeader>
        <DialogTitle>Pago registrado</DialogTitle>
        <DialogDescription>
          El pago <span className="font-mono">{outcome.folio}</span> quedó registrado.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-4">
        <Alert
          tone="warning"
          icon={CircleAlert}
          title={`No se pudo enviar el comprobante por ${channels}.`}
          description={
            <>
              {outcome.failures.map((failure) => (
                <span key={failure.channel} className="block">
                  {failure.message}
                </span>
              ))}
              <span className="mt-1 block">Puede reenviarlo desde la pestaña Pagos.</span>
            </>
          }
        />
      </div>
      <DialogFooter className="mt-4">
        <DialogClose render={<Button type="button" />}>Entendido</DialogClose>
      </DialogFooter>
    </>
  );
}
