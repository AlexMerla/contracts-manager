"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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

import { deletePackage, setPackageActive } from "./actions";

interface PackageRowActionsProps {
  pkg: { id: string; name: string; active: boolean };
}

export function PackageRowActions({ pkg }: PackageRowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function onConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deletePackage(pkg.id);
    setIsDeleting(false);
    if ("error" in result) {
      setDeleteError(result.error);
      return;
    }
    setDeleteOpen(false);
  }

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" render={<Link href={`/paquetes/${pkg.id}`} />}>
        Editar
      </Button>

      <Button
        variant={pkg.active ? "destructive" : "outline"}
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await setPackageActive(pkg.id, !pkg.active);
          })
        }
      >
        {pkg.active ? "Desactivar" : "Activar"}
      </Button>

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
            <DialogTitle>Eliminar paquete</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará el paquete
              &ldquo;{pkg.name}&rdquo; junto con sus servicios y precios
              asociados.
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
