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
  DialogDescription,
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

import { deleteService, updateService } from "./actions";

const editServiceFormSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Ingrese un nombre."),
  details: z.string(),
  categoryId: z.string().min(1, "Seleccione una categoría."),
  options: z.array(z.string()),
});

type EditServiceFormValues = z.infer<typeof editServiceFormSchema>;

interface ServiceRowActionsProps {
  service: {
    id: string;
    name: string;
    details: string | null;
    categoryId: string;
    options: string[];
  };
  categories: { id: string; name: string }[];
}

export function ServiceRowActions({
  service,
  categories,
}: ServiceRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categoryItems = Object.fromEntries(
    categories.map((category) => [category.id, category.name])
  );

  const defaultValues: EditServiceFormValues = {
    id: service.id,
    name: service.name,
    details: service.details ?? "",
    categoryId: service.categoryId,
    options: service.options,
  };

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditServiceFormValues>({
    resolver: zodResolver(editServiceFormSchema),
    defaultValues,
  });

  async function onSubmit(values: EditServiceFormValues) {
    setEditError(null);
    const result = await updateService({
      id: values.id,
      name: values.name,
      details: values.details.trim() || null,
      categoryId: values.categoryId,
      options: values.options,
    });
    if ("error" in result) {
      setEditError(result.error);
      return;
    }
    setEditOpen(false);
  }

  async function onConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteService(service.id);
    setIsDeleting(false);
    if ("error" in result) {
      setDeleteError(result.error);
      return;
    }
    setDeleteOpen(false);
  }

  return (
    <div className="flex justify-end gap-2">
      <Dialog
        open={editOpen}
        onOpenChange={(nextOpen) => {
          setEditOpen(nextOpen);
          if (nextOpen) {
            reset(defaultValues);
            setEditError(null);
          }
        }}
      >
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          Editar
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>Editar servicio</DialogTitle>
            </DialogHeader>

            <FieldGroup className="mt-4">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor={`name-${service.id}`}>Nombre</FieldLabel>
                <Input id={`name-${service.id}`} {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={!!errors.details}>
                <FieldLabel htmlFor={`details-${service.id}`}>
                  Detalles (opcional)
                </FieldLabel>
                <Input
                  id={`details-${service.id}`}
                  {...register("details")}
                />
                <FieldError errors={[errors.details]} />
              </Field>

              <Field data-invalid={!!errors.categoryId}>
                <FieldLabel htmlFor={`categoryId-${service.id}`}>
                  Categoría
                </FieldLabel>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select
                      items={categoryItems}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id={`categoryId-${service.id}`} className="w-full">
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
                    <OptionsEditor
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>

              {editError && (
                <p role="alert" className="text-sm font-normal text-destructive">
                  {editError}
                </p>
              )}
            </FieldGroup>

            <DialogFooter className="mt-4">
              <DialogClose render={<Button type="button" variant="ghost" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(nextOpen) => {
          setDeleteOpen(nextOpen);
          if (nextOpen) {
            setDeleteError(null);
          }
        }}
      >
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          Eliminar
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar servicio</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará el servicio
              &ldquo;{service.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p role="alert" className="text-sm font-normal text-destructive">
              {deleteError}
            </p>
          )}

          <DialogFooter className="mt-4">
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancelar
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={onConfirmDelete}
            >
              {isDeleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
