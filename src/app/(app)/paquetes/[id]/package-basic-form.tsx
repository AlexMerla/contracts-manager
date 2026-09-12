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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

import { updatePackage } from "../actions";

const packageFormSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
  description: z.string(),
  categoryId: z.string().min(1, "Seleccione una categoría."),
  maxQuantity: z.string(),
  quantityUnit: z.string(),
});

type PackageFormValues = z.infer<typeof packageFormSchema>;

interface PackageBasicFormProps {
  pkg: {
    id: string;
    name: string;
    description: string | null;
    categoryId: string;
    maxQuantity: number | null;
    quantityUnit: string | null;
  };
  categories: { id: string; name: string }[];
}

export function PackageBasicForm({ pkg, categories }: PackageBasicFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const categoryItems = Object.fromEntries(
    categories.map((category) => [category.id, category.name])
  );

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: {
      name: pkg.name,
      description: pkg.description ?? "",
      categoryId: pkg.categoryId,
      maxQuantity: pkg.maxQuantity != null ? String(pkg.maxQuantity) : "",
      quantityUnit: pkg.quantityUnit ?? "",
    },
  });

  async function onSubmit(values: PackageFormValues) {
    setFormError(null);
    setSaved(false);

    const trimmedMaxQuantity = values.maxQuantity.trim();
    if (trimmedMaxQuantity !== "" && !/^\d+$/.test(trimmedMaxQuantity)) {
      setFormError("La cantidad máxima debe ser un número entero positivo.");
      return;
    }

    const result = await updatePackage({
      id: pkg.id,
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
    setSaved(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos generales</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
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
            {saved && !formError && (
              <p className="text-sm font-normal text-success-fg">
                Cambios guardados.
              </p>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar cambios"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
