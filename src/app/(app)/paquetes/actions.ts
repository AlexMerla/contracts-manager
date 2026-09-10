"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const packageSchema = z.object({
  name: z.string().min(1, "Ingrese un nombre."),
  description: z.string().nullable(),
  categoryId: z.string().uuid("Seleccione una categoría."),
  // spec §6.3: null means quantity is always 1 — "no limit configured", not
  // literally unlimited.
  maxQuantity: z
    .number()
    .int("Debe ser un número entero.")
    .positive("Debe ser mayor a cero.")
    .nullable(),
  quantityUnit: z.string().nullable(),
});

const updatePackageSchema = packageSchema.extend({
  id: z.string().uuid(),
});

export type ActionResult = { error: string } | { success: true };

// Defense in depth: src/proxy.ts already blocks `normal` sessions from
// reaching /paquetes, but a server action is a real network endpoint on its
// own — spec §5 requires enforcement at the data-access layer, not only
// hidden in the UI.
async function requireSuperSession() {
  const session = await auth();
  return requireRole(session, "super");
}

export async function createPackage(
  input: z.infer<typeof packageSchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  await prisma.package.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      maxQuantity: parsed.data.maxQuantity,
      quantityUnit: parsed.data.quantityUnit,
    },
  });

  revalidatePath("/paquetes");
  return { success: true };
}

export async function updatePackage(
  input: z.infer<typeof updatePackageSchema>
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = updatePackageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  await prisma.package.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      maxQuantity: parsed.data.maxQuantity,
      quantityUnit: parsed.data.quantityUnit,
    },
  });

  revalidatePath("/paquetes");
  revalidatePath(`/paquetes/${parsed.data.id}`);
  return { success: true };
}

// Spec sprint-03 task 3: toggling `active` hides the package from the
// store-mode catalog (Sprint 4) without deleting it — never used as a
// substitute for delete.
export async function setPackageActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  await requireSuperSession();

  await prisma.package.update({ where: { id }, data: { active } });

  revalidatePath("/paquetes");
  revalidatePath(`/paquetes/${id}`);
  return { success: true };
}

// Referential-integrity guard (spec sprint-03 task 7, extended to packages):
// a package already used by a real contract (`contract_packages.package_id`,
// ON DELETE RESTRICT) must never be deleted — the contract's own snapshot
// (spec §6.5) means the FK would block it anyway, but this gives a clear
// message instead of a raw constraint error. `package_services` and
// `package_prices` rows are owned by the package itself (not independent
// catalog entities), so those are cleaned up as part of the same delete.
export async function deletePackage(id: string): Promise<ActionResult> {
  await requireSuperSession();

  const contractPackageCount = await prisma.contractPackage.count({
    where: { packageId: id },
  });

  if (contractPackageCount > 0) {
    return {
      error: `No se puede eliminar: ${contractPackageCount} ${contractPackageCount === 1 ? "contrato" : "contratos"} ya ${contractPackageCount === 1 ? "usa" : "usan"} este paquete.`,
    };
  }

  await prisma.$transaction([
    prisma.packageService.deleteMany({ where: { packageId: id } }),
    prisma.packagePrice.deleteMany({ where: { packageId: id } }),
    prisma.package.delete({ where: { id } }),
  ]);

  revalidatePath("/paquetes");
  return { success: true };
}

// Sprint-03 task 5: persists the full set of included services for a
// package in one shot — replace-all rather than incremental add/remove, so
// the UI checklist's state is always the source of truth after a save.
export async function setPackageServices(
  packageId: string,
  serviceIds: string[]
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = z
    .object({
      packageId: z.string().uuid(),
      serviceIds: z.array(z.string().uuid()),
    })
    .safeParse({ packageId, serviceIds });

  if (!parsed.success) {
    return { error: "Datos inválidos." };
  }

  await prisma.$transaction([
    prisma.packageService.deleteMany({
      where: { packageId: parsed.data.packageId },
    }),
    prisma.packageService.createMany({
      data: parsed.data.serviceIds.map((serviceId) => ({
        packageId: parsed.data.packageId,
        serviceId,
      })),
      skipDuplicates: true,
    }),
  ]);

  revalidatePath(`/paquetes/${packageId}`);
  return { success: true };
}

// Sprint-03 task 6: one price list's price for one package, independent of
// every other list — `package_prices` is unique on (package_id,
// price_list_id), so this can never leak into another list. Clearing the
// price (passing null) deletes the row rather than storing a fake zero, so
// "no price set" stays a real, distinguishable state.
export async function savePackagePrice(
  packageId: string,
  priceListId: string,
  price: number | null
): Promise<ActionResult> {
  await requireSuperSession();

  const parsed = z
    .object({
      packageId: z.string().uuid(),
      priceListId: z.string().uuid(),
      price: z.number().nonnegative("El precio no puede ser negativo.").nullable(),
    })
    .safeParse({ packageId, priceListId, price });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (parsed.data.price === null) {
    await prisma.packagePrice.deleteMany({
      where: {
        packageId: parsed.data.packageId,
        priceListId: parsed.data.priceListId,
      },
    });
  } else {
    await prisma.packagePrice.upsert({
      where: {
        packageId_priceListId: {
          packageId: parsed.data.packageId,
          priceListId: parsed.data.priceListId,
        },
      },
      create: {
        packageId: parsed.data.packageId,
        priceListId: parsed.data.priceListId,
        price: parsed.data.price,
      },
      update: { price: parsed.data.price },
    });
  }

  revalidatePath(`/paquetes/${packageId}`);
  return { success: true };
}
