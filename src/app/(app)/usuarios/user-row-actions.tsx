"use client";

import { useState, useTransition } from "react";
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

import { setUserActive, updateUser } from "./actions";

const editUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Ingrese un nombre."),
  email: z.string().email("Ingrese un correo electrónico válido."),
  role: z.enum(["super", "normal"]),
});

type EditUserValues = z.infer<typeof editUserSchema>;

const roleItems = {
  normal: "Normal",
  super: "Super Usuario",
};

interface UserRowActionsProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: "super" | "normal";
    active: boolean;
  };
}

export function UserRowActions({ user }: UserRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isTogglingActive, startToggleActive] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: user,
  });

  async function onSubmit(values: EditUserValues) {
    setFormError(null);
    const result = await updateUser(values);
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <div className="flex justify-end gap-2">
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            reset(user);
            setFormError(null);
          }
        }}
      >
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          Editar
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>Editar usuario</DialogTitle>
            </DialogHeader>

            <FieldGroup className="mt-4">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor={`name-${user.id}`}>Nombre</FieldLabel>
                <Input id={`name-${user.id}`} {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor={`email-${user.id}`}>
                  Correo electrónico
                </FieldLabel>
                <Input
                  id={`email-${user.id}`}
                  type="email"
                  {...register("email")}
                />
                <FieldError errors={[errors.email]} />
              </Field>

              <Field>
                <FieldLabel htmlFor={`role-${user.id}`}>Rol</FieldLabel>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <Select
                      items={roleItems}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id={`role-${user.id}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="super">Super Usuario</SelectItem>
                      </SelectContent>
                    </Select>
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
                {isSubmitting ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Button
        variant={user.active ? "destructive" : "outline"}
        size="sm"
        disabled={isTogglingActive}
        onClick={() =>
          startToggleActive(async () => {
            await setUserActive(user.id, !user.active);
          })
        }
      >
        {user.active ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}
