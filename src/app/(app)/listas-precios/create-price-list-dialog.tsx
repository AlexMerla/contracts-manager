"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

import { createPriceList } from "./actions";

const createPriceListSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
});

type CreatePriceListValues = z.infer<typeof createPriceListSchema>;

export function CreatePriceListDialog() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePriceListValues>({
    resolver: zodResolver(createPriceListSchema),
  });

  async function onSubmit(values: CreatePriceListValues) {
    setFormError(null);
    const result = await createPriceList(values);
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
          setFormError(null);
        }
      }}
    >
      <DialogTrigger render={<Button>Crear lista de precios</Button>} />
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Crear lista de precios</DialogTitle>
          </DialogHeader>

          <FieldGroup className="mt-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nombre</FieldLabel>
              <Input id="name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            {formError && (
              <p role="alert" className="text-sm font-normal text-destructive">
                {formError}
              </p>
            )}
          </FieldGroup>

          <DialogFooter className="mt-4">
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creando…" : "Crear lista"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
