"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OptionsEditor } from "@/components/options-editor";

import { createService } from "./actions";

const createServiceFormSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
  details: z.string(),
  categoryId: z.string().min(1, "Seleccione una categoría."),
  options: z.array(z.string()),
});

type CreateServiceFormValues = z.infer<typeof createServiceFormSchema>;

interface CreateServiceDialogProps {
  categories: { id: string; name: string }[];
}

export function CreateServiceDialog({ categories }: CreateServiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categoryItems = Object.fromEntries(
    categories.map((category) => [category.id, category.name])
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateServiceFormValues>({
    resolver: zodResolver(createServiceFormSchema),
    defaultValues: { name: "", details: "", categoryId: "", options: [] },
  });

  async function onSubmit(values: CreateServiceFormValues) {
    setFormError(null);
    const result = await createService({
      name: values.name,
      details: values.details.trim() || null,
      categoryId: values.categoryId,
      options: values.options,
    });
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
      <DialogTrigger render={<Button>Crear servicio</Button>} />
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Crear servicio</DialogTitle>
          </DialogHeader>

          <FieldGroup className="mt-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nombre</FieldLabel>
              <Input id="name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.details}>
              <FieldLabel htmlFor="details">Detalles (opcional)</FieldLabel>
              <Input id="details" {...register("details")} />
              <FieldError errors={[errors.details]} />
            </Field>

            <Field data-invalid={!!errors.categoryId}>
              <FieldLabel htmlFor="categoryId">Categoría</FieldLabel>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    items={categoryItems}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger id="categoryId" className="w-full">
                      <SelectValue placeholder="Seleccione una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.categoryId]} />
            </Field>

            <Field>
              <FieldLabel>Opciones (opcional, elegir 1 de N)</FieldLabel>
              <Controller
                control={control}
                name="options"
                render={({ field }) => (
                  <OptionsEditor value={field.value} onChange={field.onChange} />
                )}
              />
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
              {isSubmitting ? "Creando…" : "Crear servicio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
