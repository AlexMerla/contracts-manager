"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// spec §6.6: `options` is an array of strings for "choose 1 of N" services;
// null/empty for services with no choice. Empty strings aren't meaningful
// options, so they're filtered out before persisting.
const serviceSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
  details: z.string().nullable(),
  categoryId: z.string().uuid("Seleccione una categoría."),
  options: z.array(z.string()),
});

const updateServiceSchema = serviceSchema.extend({
  id: z.string().uuid(),
});

export type ActionResult = { error: string } | { success: true };

// Defense in depth: src/proxy.ts already blocks `normal` sessions from
// reaching /servicios, but a server action is a real network endpoint on
// its own — spec §5 requires enforcement at the data-access layer, not only
// hidden in the UI.
async function requireSuperSession() {
  const session = await auth();
  return requireRole(session, "super");
}

function normalizeOptions(options: string[]): Prisma.InputJsonValue | null {
  const cleaned = options.map((option) => option.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

export async function createService(
  input: z.infer<typeof serviceSchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  await prisma.service.create({
    data: {
      name: parsed.data.name,
      details: parsed.data.details,
      categoryId: parsed.data.categoryId,
      options: normalizeOptions(parsed.data.options) ?? undefined,
    },
  });

  revalidatePath("/servicios");
  return { success: true };
}

export async function updateService(
  input: z.infer<typeof updateServiceSchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = updateServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  await prisma.service.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      details: parsed.data.details,
      categoryId: parsed.data.categoryId,
      options: normalizeOptions(parsed.data.options) ?? Prisma.JsonNull,
    },
  });

  revalidatePath("/servicios");
  return { success: true };
}

// Referential-integrity guard (spec sprint-03 task 7): a service still
// referenced by `package_services` (included in a package) or by
// `contract_service_selections` (a client already chose an option on a real
// contract) must be blocked with a clear message rather than a raw
// constraint error — both have ON DELETE RESTRICT on `service_id`.
export async function deleteService(id: string): Promise<ActionResult> {
  await requireSuperSession();

  const [packageServiceCount, selectionCount] = await Promise.all([
    prisma.packageService.count({ where: { serviceId: id } }),
    prisma.contractServiceSelection.count({ where: { serviceId: id } }),
  ]);

  if (packageServiceCount > 0 || selectionCount > 0) {
    const parts: string[] = [];
    if (packageServiceCount > 0) {
      parts.push(
        `${packageServiceCount} ${packageServiceCount === 1 ? "paquete" : "paquetes"}`
      );
    }
    if (selectionCount > 0) {
      parts.push(
        `${selectionCount} ${selectionCount === 1 ? "contrato" : "contratos"}`
      );
    }
    return {
      error: `No se puede eliminar: todavía hay ${parts.join(" y ")} que usan este servicio.`,
    };
  }

  await prisma.service.delete({ where: { id } });

  revalidatePath("/servicios");
  return { success: true };
}
