"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import { cancelContract } from "./actions";
import { cancelContractSchema, type CancelContractValues } from "./schema";

interface CancelContractDialogProps {
  contractId: string;
  /** Resolved Q1: a contract that is already settled is still cancellable,
   *  but the dialog warns first — no refund is processed anywhere in this
   *  system, and the person clicking must know that before confirming. */
  isPaidInFull: boolean;
}

/**
 * The destructive confirmation for `cancelContract`.
 *
 * Two established patterns, deliberately combined rather than a third one
 * invented: the form plumbing is `register-payment-dialog.tsx`'s
 * (`useForm` + `zodResolver` + a `formError` string + `setOpen`), and the
 * destructive framing is `categorias/category-row-actions.tsx`'s delete
 * dialog (a `DialogDescription` that states the irreversibility, a ghost
 * "Cancelar" on the left, a `variant="destructive"` confirm on the right).
 * There is NO extra "¿está seguro?" step: the mandatory typed reason already
 * makes this an act, not a misclick.
 */
export function CancelContractDialog({ contractId, isPaidInFull }: CancelContractDialogProps) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CancelContractValues>({
    resolver: zodResolver(cancelContractSchema),
    defaultValues: { contractId, reason: "" },
  });

  async function onSubmit(values: CancelContractValues) {
    setFormError(null);

    const result = await cancelContract(values);
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    // No `reset()` on success: the page revalidates into its cancelled state,
    // where this dialog is no longer rendered at all.
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset({ contractId, reason: "" });
          setFormError(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="destructive" className="w-full" />}>
        Cancelar contrato
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Cancelar contrato</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El enlace que el cliente tiene dejará de
              funcionar de inmediato y no se podrán registrar más pagos. Los pagos ya
              registrados y el historial se conservan.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="mt-4">
            {isPaidInFull && (
              <Alert
                tone="warning"
                icon={CircleAlert}
                title="Este contrato ya está pagado en su totalidad"
                description="La cancelación no procesa ningún reembolso. Acuerde la devolución con el cliente por fuera del sistema antes de continuar."
              />
            )}

            <Field data-invalid={!!errors.reason}>
              <FieldLabel htmlFor="cancellation-reason">Motivo de la cancelación</FieldLabel>
              <Textarea
                id="cancellation-reason"
                placeholder="Ej. el cliente canceló el evento por motivos familiares."
                {...register("reason")}
              />
              <FieldError errors={[errors.reason]} />
            </Field>

            {formError && (
              <p role="alert" className="text-sm font-normal text-destructive">
                {formError}
              </p>
            )}
          </FieldGroup>

          <DialogFooter className="mt-4">
            <DialogClose render={<Button type="button" variant="ghost" />}>Volver</DialogClose>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Cancelando…" : "Cancelar contrato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
