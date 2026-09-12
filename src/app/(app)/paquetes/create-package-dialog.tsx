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

import { createPackage } from "./actions";

const createPackageFormSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
  description: z.string(),
  categoryId: z.string().min(1, "Seleccione una categoría."),
  maxQuantity: z.string(),
  quantityUnit: z.string(),
});

type CreatePackageFormValues = z.infer<typeof createPackageFormSchema>;

interface CreatePackageDialogProps {
  categories: { id: string; name: string }[];
}

export function CreatePackageDialog({ categories }: CreatePackageDialogProps) {
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
  } = useForm<CreatePackageFormValues>({
    resolver: zodResolver(createPackageFormSchema),
    defaultValues: {
      name: "",
      description: "",
      categoryId: "",
      maxQuantity: "",
      quantityUnit: "",
    },
  });

  async function onSubmit(values: CreatePackageFormValues) {
    setFormError(null);

    const trimmedMaxQuantity = values.maxQuantity.trim();
    if (trimmedMaxQuantity !== "" && !/^\d+$/.test(trimmedMaxQuantity)) {
      setFormError("La cantidad máxima debe ser un número entero positivo.");
      return;
    }

    const result = await createPackage({
      name: values.name,
      description: values.description.trim() || null,
      categoryId: values.categoryId,
      maxQuantity: trimmedMaxQuantity === "" ? null : Number(trimmedMaxQuantity),
      quantityUnit: values.quantityUnit.trim() || null,
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
      <DialogTrigger render={<Button>Crear paquete</Button>} />
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Crear paquete</DialogTitle>
          </DialogHeader>

          <FieldGroup className="mt-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nombre</FieldLabel>
              <Input id="name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="description">
                Descripción (opcional)
              </FieldLabel>
              <Input id="description" {...register("description")} />
              <FieldError errors={[errors.description]} />
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

            <Field data-invalid={!!errors.maxQuantity}>
              <FieldLabel htmlFor="maxQuantity">
                Cantidad máxima (opcional)
              </FieldLabel>
              <Input
                id="maxQuantity"
                inputMode="numeric"
                placeholder="Ej. 99 — vacío significa cantidad fija de 1"
                {...register("maxQuantity")}
              />
              <FieldError errors={[errors.maxQuantity]} />
            </Field>

            <Field data-invalid={!!errors.quantityUnit}>
              <FieldLabel htmlFor="quantityUnit">
                Unidad de cantidad (opcional)
              </FieldLabel>
              <Input
                id="quantityUnit"
                placeholder="Ej. pantallas, banners"
                {...register("quantityUnit")}
              />
              <FieldError errors={[errors.quantityUnit]} />
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
              {isSubmitting ? "Creando…" : "Crear paquete"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
