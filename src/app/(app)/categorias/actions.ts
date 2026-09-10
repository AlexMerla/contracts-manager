"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const categorySchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
});

const updateCategorySchema = categorySchema.extend({
  id: z.string().uuid(),
});

export type ActionResult = { error: string } | { success: true };

// Defense in depth: src/proxy.ts already blocks `normal` sessions from
// reaching /categorias, but a server action is a real network endpoint on
// its own — spec §5 requires enforcement "at the data-access layer, not
// only hidden in the UI", so every action here checks independently too.
async function requireSuperSession() {
  const session = await auth();
  return requireRole(session, "super");
}

export async function createCategory(
  input: z.infer<typeof categorySchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  await prisma.category.create({ data: { name: parsed.data.name } });

  revalidatePath("/categorias");
  return { success: true };
}

export async function updateCategory(
  input: z.infer<typeof updateCategorySchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  await prisma.category.update({
    where: { id: parsed.data.id },
    data: { name: parsed.data.name },
  });

  revalidatePath("/categorias");
  return { success: true };
}

// Spec task 7 (sprint 3): deleting a category still referenced by a package
// or a service must fail with a clear message rather than relying on the
// database's ON DELETE RESTRICT to surface a raw constraint error. Both
// `packages.category_id` and `services.category_id` reference `categories`.
export async function deleteCategory(id: string): Promise<ActionResult> {
  await requireSuperSession();

  const [packageCount, serviceCount] = await Promise.all([
    prisma.package.count({ where: { categoryId: id } }),
    prisma.service.count({ where: { categoryId: id } }),
  ]);

  if (packageCount > 0 || serviceCount > 0) {
    const parts: string[] = [];
    if (packageCount > 0) {
      parts.push(
        `${packageCount} ${packageCount === 1 ? "paquete" : "paquetes"}`
      );
    }
    if (serviceCount > 0) {
      parts.push(
        `${serviceCount} ${serviceCount === 1 ? "servicio" : "servicios"}`
      );
    }
    return {
      error: `No se puede eliminar: todavía hay ${parts.join(" y ")} que usan esta categoría.`,
    };
  }

  await prisma.category.delete({ where: { id } });

  revalidatePath("/categorias");
  return { success: true };
}
