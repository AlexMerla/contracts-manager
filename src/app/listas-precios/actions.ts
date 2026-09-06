"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const priceListSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
});

const updatePriceListSchema = priceListSchema.extend({
  id: z.string().uuid(),
});

export type ActionResult = { error: string } | { success: true };

// Defense in depth: src/proxy.ts already blocks `normal` sessions from
// reaching /listas-precios, but a server action is a real network endpoint
// on its own — spec §5 requires enforcement at the data-access layer, not
// only hidden in the UI.
async function requireSuperSession() {
  const session = await auth();
  return requireRole(session, "super");
}

export async function createPriceList(
  input: z.infer<typeof priceListSchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = priceListSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  // The very first price list ever created has nothing to be default
  // relative to — make it the default automatically so the "exactly one
  // default at all times" invariant (spec §6.9) holds from row one.
  const existingCount = await prisma.priceList.count();

  await prisma.priceList.create({
    data: { name: parsed.data.name, isDefault: existingCount === 0 },
  });

  revalidatePath("/listas-precios");
  return { success: true };
}

export async function updatePriceList(
  input: z.infer<typeof updatePriceListSchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = updatePriceListSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  await prisma.priceList.update({
    where: { id: parsed.data.id },
    data: { name: parsed.data.name },
  });

  revalidatePath("/listas-precios");
  return { success: true };
}

export async function setPriceListActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  await requireSuperSession();

  await prisma.priceList.update({ where: { id }, data: { active } });

  revalidatePath("/listas-precios");
  return { success: true };
}

// Spec §6.9: "exactly one [price list] should have [is_default] true —
// enforce at the application layer since the database doesn't guarantee
// it." Wrapped in a transaction so a crash mid-way can never leave two
// defaults (or zero) set.
export async function setPriceListDefault(id: string): Promise<ActionResult> {
  await requireSuperSession();

  await prisma.$transaction([
    prisma.priceList.updateMany({
      where: { isDefault: true, NOT: { id } },
      data: { isDefault: false },
    }),
    prisma.priceList.update({
      where: { id },
      data: { isDefault: true },
    }),
  ]);

  revalidatePath("/listas-precios");
  return { success: true };
}

// Referential-integrity guard (spec sprint-03 task 7, extended to price
// lists): `package_prices.price_list_id` and `contracts.price_list_id` both
// have ON DELETE RESTRICT — surface that as a clear message instead of a raw
// constraint error. Also refuse to delete the current default list, since
// deleting it would leave the "exactly one default" invariant broken with no
// automatic replacement to promote.
export async function deletePriceList(id: string): Promise<ActionResult> {
  await requireSuperSession();

  const priceList = await prisma.priceList.findUnique({ where: { id } });
  if (!priceList) {
    return { error: "La lista de precios ya no existe." };
  }

  if (priceList.isDefault) {
    return {
      error:
        "No se puede eliminar: esta es la lista de precios predeterminada. Marque otra lista como predeterminada primero.",
    };
  }

  const [packagePriceCount, contractCount] = await Promise.all([
    prisma.packagePrice.count({ where: { priceListId: id } }),
    prisma.contract.count({ where: { priceListId: id } }),
  ]);

  if (packagePriceCount > 0 || contractCount > 0) {
    const parts: string[] = [];
    if (packagePriceCount > 0) {
      parts.push(
        `${packagePriceCount} ${packagePriceCount === 1 ? "precio de paquete" : "precios de paquetes"}`
      );
    }
    if (contractCount > 0) {
      parts.push(
        `${contractCount} ${contractCount === 1 ? "contrato" : "contratos"}`
      );
    }
    return {
      error: `No se puede eliminar: todavía hay ${parts.join(" y ")} que usan esta lista.`,
    };
  }

  await prisma.priceList.delete({ where: { id } });

  revalidatePath("/listas-precios");
  return { success: true };
}
