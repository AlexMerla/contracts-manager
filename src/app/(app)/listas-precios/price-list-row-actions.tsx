"use client";

import { useState, useTransition } from "react";
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

import {
  deletePriceList,
  setPriceListActive,
  setPriceListDefault,
  updatePriceList,
} from "./actions";

const editPriceListSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Ingrese un nombre."),
});

type EditPriceListValues = z.infer<typeof editPriceListSchema>;

interface PriceListRowActionsProps {
  priceList: {
    id: string;
    name: string;
    isDefault: boolean;
    active: boolean;
  };
}

export function PriceListRowActions({ priceList }: PriceListRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditPriceListValues>({
    resolver: zodResolver(editPriceListSchema),
    defaultValues: { id: priceList.id, name: priceList.name },
  });

  async function onSubmit(values: EditPriceListValues) {
    setEditError(null);
    const result = await updatePriceList(values);
    if ("error" in result) {
      setEditError(result.error);
      return;
    }
    setEditOpen(false);
  }

  async function onConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deletePriceList(priceList.id);
    setIsDeleting(false);
    if ("error" in result) {
      setDeleteError(result.error);
      return;
    }
    setDeleteOpen(false);
  }

  return (
    <div className="flex justify-end gap-2">
      {!priceList.isDefault && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setPriceListDefault(priceList.id);
            })
          }
        >
          Marcar como predeterminada
        </Button>
      )}

      <Button
        variant={priceList.active ? "destructive" : "outline"}
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await setPriceListActive(priceList.id, !priceList.active);
          })
        }
      >
        {priceList.active ? "Desactivar" : "Activar"}
      </Button>

      <Dialog
        open={editOpen}
        onOpenChange={(nextOpen) => {
          setEditOpen(nextOpen);
          if (nextOpen) {
            reset({ id: priceList.id, name: priceList.name });
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
              <DialogTitle>Editar lista de precios</DialogTitle>
            </DialogHeader>

            <FieldGroup className="mt-4">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor={`name-${priceList.id}`}>
                  Nombre
                </FieldLabel>
                <Input id={`name-${priceList.id}`} {...register("name")} />
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
            <DialogTitle>Eliminar lista de precios</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará la lista &ldquo;
              {priceList.name}&rdquo;.
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
