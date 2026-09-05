"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const roleSchema = z.enum(["super", "normal"]);

const createUserSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
  email: z.string().email("Ingrese un correo electrónico válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  role: roleSchema,
});

const updateUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Ingrese un nombre."),
  email: z.string().email("Ingrese un correo electrónico válido."),
  role: roleSchema,
});

export type ActionResult = { error: string } | { success: true };

// Defense in depth: src/proxy.ts already blocks `normal` sessions from
// reaching /usuarios, but a server action is a real network endpoint on its
// own — it must reject on its own too, per spec §5's "enforced at the
// data-access layer, not only hidden in the UI".
async function requireSuperSession() {
  const session = await auth();
  return requireRole(session, "super");
}

export async function createUser(
  input: z.infer<typeof createUserSchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return { error: "Ya existe un usuario con ese correo electrónico." };
  }

  const passwordHash = await hash(parsed.data.password, 10);

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
    },
  });

  revalidatePath("/usuarios");
  return { success: true };
}

export async function updateUser(
  input: z.infer<typeof updateUserSchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const existing = await prisma.user.findFirst({
    where: { email: parsed.data.email, NOT: { id: parsed.data.id } },
  });
  if (existing) {
    return { error: "Ya existe otro usuario con ese correo electrónico." };
  }

  await prisma.user.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
    },
  });

  revalidatePath("/usuarios");
  return { success: true };
}

export async function setUserActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  await requireSuperSession();

  await prisma.user.update({ where: { id }, data: { active } });

  revalidatePath("/usuarios");
  return { success: true };
}
