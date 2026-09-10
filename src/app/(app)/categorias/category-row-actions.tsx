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
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

import { deleteCategory, updateCategory } from "./actions";

const editCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Ingrese un nombre."),
});

type EditCategoryValues = z.infer<typeof editCategorySchema>;

interface CategoryRowActionsProps {
  category: { id: string; name: string };
}

export function CategoryRowActions({ category }: CategoryRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditCategoryValues>({
    resolver: zodResolver(editCategorySchema),
    defaultValues: category,
  });

  async function onSubmit(values: EditCategoryValues) {
    setEditError(null);
    const result = await updateCategory(values);
    if ("error" in result) {
      setEditError(result.error);
      return;
    }
    setEditOpen(false);
  }

  async function onConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteCategory(category.id);
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
            reset(category);
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
              <DialogTitle>Editar categoría</DialogTitle>
            </DialogHeader>

            <FieldGroup className="mt-4">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor={`name-${category.id}`}>Nombre</FieldLabel>
                <Input id={`name-${category.id}`} {...register("name")} />
                <FieldError errors={[errors.name]} />
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
            <DialogTitle>Eliminar categoría</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará la categoría
              &ldquo;{category.name}&rdquo;.
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
