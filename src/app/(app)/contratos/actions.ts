"use server";

import { randomUUID } from "node:crypto";

import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import { nextFolio } from "@/lib/contracts/folio";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

import { createContractPayloadSchema, type CreateContractPayload } from "./nuevo/schema";

export type CreateContractResult =
  | { error: string }
  | { success: true; contractId: string; folio: string };

// Spec §5: contract creation is allowed for both roles — this only proves a
// session exists (role: "normal" is the "everyone" minimum per
// src/lib/navigation.ts's convention), unlike the catalog CRUD actions'
// `requireRole(session, "super")`.
async function requireSession() {
  const session = await auth();
  return requireRole(session, "normal");
}

const MAX_FOLIO_ATTEMPTS = 3;

function isFolioCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    (error.meta.target as string[]).includes("folio")
  );
}

// Spec §8 step 6 / sprint-04 tasks 6-7 — the confirm-and-create endpoint.
// Re-validates and recomputes everything server-side; nothing from the
// client payload is trusted as final except the *choices* (which packages,
// which quantities, which service options, which discount/extra-charge/
// deposit override) — names, prices, and the owning user are always
// resolved here.
export async function createContract(
  input: CreateContractPayload
): Promise<CreateContractResult> {
  const session = await requireSession();

  const parsed = createContractPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  // `scopeToOwner` deliberately does not intercept `create`/`createMany`
  // (see src/lib/authorization.ts) — this whole action only ever creates
  // rows (never reads/updates/deletes an existing contract), and `Package`
  // isn't an owner-scoped model at all, so the extension would be a no-op
  // here in every case it matters. It's used instead by the list/detail
  // pages, which do real scoped reads. Using it here anyway would also hit
  // a real TypeScript limitation: `$transaction`'s overloaded signature
  // doesn't resolve cleanly against `scopeToOwner`'s `PrismaClient |
  // ExtendedClient` return type.
  const packageIds = data.orderLines.map((line) => line.packageId);
  const uniquePackageIds = new Set(packageIds);
  if (uniquePackageIds.size !== packageIds.length) {
    return { error: "El pedido tiene paquetes duplicados." };
  }

  const packages = await prisma.package.findMany({
    where: { id: { in: packageIds } },
    include: {
      packagePrices: { where: { priceListId: data.priceListId } },
      packageServices: { include: { service: true } },
    },
  });
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));

  let subtotal = 0;
  const contractPackagesData: {
    packageId: string;
    nameSnapshot: string;
    priceSnapshot: number;
    quantity: number;
  }[] = [];
  // Services that actually require a selection, given the packages really
  // in the order — recomputed server-side rather than trusting which
  // services the client thought were required (sprint-04 task 3's rule,
  // enforced again here per task 6's "re-validates ... server-side").
  const requiredServices = new Map<string, { name: string; options: string[] }>();

  for (const line of data.orderLines) {
    const pkg = packageById.get(line.packageId);
    if (!pkg) {
      return { error: "Uno o más paquetes del pedido ya no existen." };
    }
    if (!pkg.active) {
      return { error: `El paquete "${pkg.name}" ya no está activo.` };
    }

    const maxQuantity = pkg.maxQuantity ?? 1;
    if (line.quantity > maxQuantity) {
      return {
        error: `La cantidad de "${pkg.name}" (${line.quantity}) excede el máximo permitido (${maxQuantity}).`,
      };
    }

    const price = pkg.packagePrices[0]?.price;
    if (price == null) {
      return { error: `El paquete "${pkg.name}" no tiene precio en la lista seleccionada.` };
    }

    const unitPrice = Number(price);
    subtotal += unitPrice * line.quantity;

    contractPackagesData.push({
      packageId: pkg.id,
      nameSnapshot: pkg.name,
      priceSnapshot: unitPrice,
      quantity: line.quantity,
    });

    for (const { service } of pkg.packageServices) {
      const options = Array.isArray(service.options) ? (service.options as string[]) : [];
      if (options.length > 0) {
        requiredServices.set(service.id, { name: service.name, options });
      }
    }
  }

  const selectionByServiceId = new Map(
    data.serviceSelections.map((selection) => [selection.serviceId, selection.selectedOption])
  );
  for (const [serviceId, { name, options }] of requiredServices) {
    const selected = selectionByServiceId.get(serviceId);
    if (!selected || !options.includes(selected)) {
      return { error: `Falta elegir una opción para el servicio "${name}".` };
    }
  }

  const discount = data.discount ?? 0;
  const extraCharge = data.extraCharge ?? 0;
  const total = subtotal - discount + extraCharge;
  const balance = total - data.deposit;
  const viewerToken = randomUUID();

  const contractServiceSelectionsData = Array.from(requiredServices.keys()).map((serviceId) => ({
    serviceId,
    // Presence and validity already checked above.
    selectedOption: selectionByServiceId.get(serviceId) as string,
  }));

  const { clientName, clientPhone, clientMobile, clientEmail, clientAddress, eventType, celebrated, eventDate, eventTime, placeName, placeAddress } =
    data.contractData;

  for (let attempt = 1; attempt <= MAX_FOLIO_ATTEMPTS; attempt += 1) {
    try {
      const contract = await prisma.$transaction(async (tx) => {
        const folio = await nextFolio(tx);

        const created = await tx.contract.create({
          data: {
            folio,
            clientName,
            clientPhone: clientPhone.trim() || null,
            clientMobile: clientMobile.trim() || null,
            clientEmail: clientEmail.trim() || null,
            clientAddress: clientAddress.trim() || null,
            eventType,
            celebrated: celebrated.trim() || null,
            eventDate: new Date(`${eventDate}T00:00:00.000Z`),
            eventTime: eventTime.trim() ? new Date(`1970-01-01T${eventTime}:00.000Z`) : null,
            placeName: placeName.trim() || null,
            placeAddress: placeAddress.trim() || null,
            discount: data.discount,
            extraCharge: data.extraCharge,
            subtotal,
            total,
            deposit: data.deposit,
            balance,
            viewerToken,
            priceListId: data.priceListId,
            // Never from client input (sprint-04 task 7) — always the
            // authenticated session's own id, even if the payload somehow
            // carried a `createdById` (the schema doesn't define that field,
            // so zod would have stripped it already).
            createdById: session.user.id,
          },
        });

        if (contractPackagesData.length > 0) {
          await tx.contractPackage.createMany({
            data: contractPackagesData.map((line) => ({
              ...line,
              contractId: created.id,
            })),
          });
        }

        if (contractServiceSelectionsData.length > 0) {
          await tx.contractServiceSelection.createMany({
            data: contractServiceSelectionsData.map((selection) => ({
              ...selection,
              contractId: created.id,
            })),
          });
        }

        return created;
      });

      return { success: true, contractId: contract.id, folio: contract.folio };
    } catch (error: unknown) {
      if (isFolioCollision(error) && attempt < MAX_FOLIO_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }

  // Unreachable — the loop above always returns or throws.
  return { error: "No se pudo generar un folio único. Intente nuevamente." };
}
