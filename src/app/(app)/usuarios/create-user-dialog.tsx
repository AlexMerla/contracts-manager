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

import { createUser } from "./actions";

const createUserSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
  email: z.string().email("Ingrese un correo electrónico válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  role: z.enum(["super", "normal"]),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

const roleItems = {
  normal: "Usuario Normal",
  super: "Super Usuario",
};

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "normal" },
  });

  async function onSubmit(values: CreateUserValues) {
    setFormError(null);
    const result = await createUser(values);
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
      <DialogTrigger render={<Button size="lg">Crear usuario</Button>} />
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Crear usuario</DialogTitle>
            <DialogDescription>
              El usuario podrá iniciar sesión con el correo y la contraseña
              que defina aquí.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="mt-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nombre</FieldLabel>
              <Input id="name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
              <Input id="email" type="email" {...register("email")} />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Input id="password" type="password" {...register("password")} />
              <FieldError errors={[errors.password]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="role">Rol</FieldLabel>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select
                    items={roleItems}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger id="role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Usuario Normal</SelectItem>
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
              {isSubmitting ? "Creando…" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
