"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { requireRole, scopeToOwner } from "@/lib/authorization";
import {
  generateContractImages,
  type ContractImagePair,
} from "@/lib/contract-template/generate-contract-image";
import { getContractImageBuffers } from "@/lib/contract-template/get-contract-image-buffer";
import type { ContractDeliveryStepResult } from "@/lib/contracts/delivery-step";
import { nextFolio } from "@/lib/contracts/folio";
import { sendContractEmail } from "@/lib/email/contract-email";
import { upsertContractCalendarEvent } from "@/lib/google/calendar";
import { uploadContractImageToDrive } from "@/lib/google/drive";
import { triggerContractWhatsApp } from "@/lib/whatsapp/manychat";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";

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
      category: { select: { name: true } },
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

      // Sprint 5 task 6 / spec §4.2: image generation runs AFTER the
      // transaction has committed, as a separate best-effort step — never
      // inside prisma.$transaction. If it throws, contract creation must
      // still succeed; `imageGenerated` stays `false` for the manual retry
      // action (task 7 / `regenerateContractImage` below) rather than
      // rolling back or blocking the response.
      let contractImages: ContractImagePair | null = null;
      try {
        contractImages = await generateContractImages({
          folio: contract.folio,
          eventDate: contract.eventDate,
          eventTime: contract.eventTime,
          clientName: contract.clientName,
          eventType: EVENT_TYPE_LABEL[contract.eventType],
          clientAddress: contract.clientAddress,
          celebrated: contract.celebrated,
          clientEmail: contract.clientEmail,
          clientPhone: contract.clientPhone,
          clientMobile: contract.clientMobile,
          placeName: contract.placeName,
          placeAddress: contract.placeAddress,
          services: contractPackagesData.map((line) => ({
            name: line.nameSnapshot,
            quantity: line.quantity,
            category: packageById.get(line.packageId)?.category.name ?? null,
          })),
          total,
          deposit: data.deposit,
          balance,
        });
        await prisma.contract.update({
          where: { id: contract.id },
          data: { imageGenerated: true },
        });
      } catch (error: unknown) {
        console.error(`Failed to generate image for contract ${contract.id}:`, error);
      }

      // Sprint 6 task 8 / spec §4.2 step 2: the rest of the sequential
      // delivery pipeline, still in this same request, still after the
      // transaction. Each step gets its OWN try/catch so a Drive outage can't
      // stop Calendar from being attempted (and vice versa), and neither can
      // stop this action from returning success — the contract row already
      // exists. Whatever failed stays `false` in its status column and is
      // reported on the detail page (the wizard redirects there on success)
      // as its own retry button, per §4.2 steps 4-5.
      //
      // Both step functions already convert Google/API failures into a result
      // object rather than throwing; the try/catch is for the everything-else
      // case (a Prisma write failing, say), so this stays true by construction
      // and not just by their current implementation.
      try {
        // Passes the pair just produced instead of re-rendering both images —
        // this is the first consumer of `generateContractImages`'s return
        // value. `null` (generation failed) means Drive regenerates the pair
        // itself and reports its own failure if that also fails.
        const drive = await uploadContractImageToDrive(contract.id, contractImages ?? undefined);
        if (!drive.ok) {
          console.error(`Drive upload failed for contract ${contract.id}: ${drive.message}`);
        }
      } catch (error: unknown) {
        console.error(`Drive upload threw for contract ${contract.id}:`, error);
      }

      // Order is now load-bearing, not just incidental: Calendar's 📎 link
      // reads the OFFICIAL contract's `driveFileId`, which only exists once
      // the Drive step above has run — Drive must stay before Calendar.
      try {
        const calendar = await upsertContractCalendarEvent(contract.id);
        if (!calendar.ok) {
          console.error(
            `Calendar event failed for contract ${contract.id}: ${calendar.message}`
          );
        }
      } catch (error: unknown) {
        console.error(`Calendar event threw for contract ${contract.id}:`, error);
      }

      // Sprint 7 task 6 — the last two steps of §4.2's sequence. Same
      // independent try/catch shape as Drive and Calendar above: a Resend
      // outage must not stop the ManyChat trigger, and neither may stop this
      // action from returning success.
      //
      // Email before WhatsApp, per §4.2 step 2's stated order. The ordering
      // is not load-bearing the way Drive→Calendar is (neither step reads the
      // other's output — both build the same public link from `viewerToken`),
      // but WhatsApp goes last deliberately: it is the only step with no
      // status column, so if the request dies partway, everything still
      // retriable has already been attempted.
      try {
        const email = await sendContractEmail(contract.id);
        if (!email.ok) {
          console.error(`Email delivery failed for contract ${contract.id}: ${email.message}`);
        }
      } catch (error: unknown) {
        console.error(`Email delivery threw for contract ${contract.id}:`, error);
      }

      // No `whatsappTriggered` column exists (spec §6.4 defines none, and
      // that was re-confirmed as a product decision for this sprint), so a
      // failure here is only logged — the copyable public link on the
      // contract detail page (task 5) is the intended manual fallback.
      try {
        const whatsapp = await triggerContractWhatsApp(contract.id);
        if (!whatsapp.ok) {
          console.error(
            `WhatsApp trigger failed for contract ${contract.id}: ${whatsapp.message}`
          );
        }
      } catch (error: unknown) {
        console.error(`WhatsApp trigger threw for contract ${contract.id}:`, error);
      }

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

export type RegenerateContractImageResult = { success: true } | { error: string };

// Sprint 5 tasks 6 & 7: this single action serves both as the "on demand"
// regeneration entry point (task 6 — reusable later by Drive upload, email
// attachment, and the public viewer, all of which will call
// `getContractImageBuffer` directly rather than through this action) and as
// the manual retry action bound to the contract detail page's "Reintentar
// generación de imagen" button (task 7). Building two near-identical
// functions for the same operation would just be duplication; the only
// thing this action adds on top of `getContractImageBuffer` is the
// owner-scoped authorization check and flipping `imageGenerated`.
//
// Per spec §4.2, retrying is naturally idempotent here: generation always
// reads fresh from stored data and never checks/dedupes against a prior
// attempt, so calling this again for an already-succeeded contract simply
// regenerates the same image and re-sets the same flag.
export async function regenerateContractImage(
  contractId: string
): Promise<RegenerateContractImageResult> {
  const session = await requireSession();

  // Ownership check per spec §5: a `normal` user must not be able to
  // regenerate (or even probe the existence of) another user's contract.
  const db = scopeToOwner(session);
  const contract = await db.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    return { error: "Contrato no encontrado." };
  }

  try {
    await getContractImageBuffers(contractId);
  } catch (error: unknown) {
    console.error(`Failed to regenerate image for contract ${contractId}:`, error);
    return { error: "No se pudo generar la imagen del contrato. Intente nuevamente." };
  }

  await prisma.contract.update({
    where: { id: contractId },
    data: { imageGenerated: true },
  });

  revalidatePath(`/contratos/${contractId}`);

  return { success: true };
}

export type RetryDeliveryStepResult = { success: true } | { error: string };

// Sprint 6 task 8 / spec §4.2 step 5 — one manual retry action per status
// column. Shared body: both retries differ only in which step function they
// run, so the session check, the owner scoping and the revalidate live here
// once. Not exported (a "use server" module may only export async functions,
// and this one takes a non-serializable callback).
async function runContractDeliveryRetry(
  contractId: string,
  step: (id: string) => Promise<ContractDeliveryStepResult>
): Promise<RetryDeliveryStepResult> {
  const session = await requireSession();

  // Same ownership rule as `regenerateContractImage` (spec §5): a `normal`
  // user must not be able to retry — or probe the existence of — another
  // user's contract.
  const db = scopeToOwner(session);
  const contract = await db.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    return { error: "Contrato no encontrado." };
  }

  let result: ContractDeliveryStepResult;
  try {
    result = await step(contractId);
  } catch (error: unknown) {
    console.error(`Delivery step retry threw for contract ${contractId}:`, error);
    return { error: "No se pudo completar el paso. Intente nuevamente." };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  // Re-renders the detail page, which drops this button now that its status
  // column is `true`.
  revalidatePath(`/contratos/${contractId}`);

  return { success: true };
}

/** Retries ONLY the Drive upload (idempotent — see `uploadContractImageToDrive`). */
export async function retryDriveUpload(contractId: string): Promise<RetryDeliveryStepResult> {
  return runContractDeliveryRetry(contractId, (id) => uploadContractImageToDrive(id));
}

/** Retries ONLY the Calendar event (upserts — see `upsertContractCalendarEvent`). */
export async function retryCalendarEvent(contractId: string): Promise<RetryDeliveryStepResult> {
  return runContractDeliveryRetry(contractId, upsertContractCalendarEvent);
}

/**
 * Sprint 7 task 3 — retries ONLY the client email. Reuses the exact same
 * shared body as the Drive and Calendar retries, so the §5 ownership check is
 * identical. `sendContractEmail` short-circuits on `emailSent === true`, so a
 * double click (or a retry on an already-delivered contract) cannot send the
 * client a second copy — §4.2's "retrying must not create duplicate emails".
 */
export async function retryEmail(contractId: string): Promise<RetryDeliveryStepResult> {
  return runContractDeliveryRetry(contractId, sendContractEmail);
}

/**
 * Retries ONLY the WhatsApp trigger. There is no `whatsappTriggered` column
 * (product decision, spec §4.2's pattern deliberately not extended here) —
 * so unlike the other three retries, the caller cannot hide this button once
 * it "succeeds"; it stays available indefinitely, same as the copyable link
 * it sits next to (sprint-07 task 5).
 */
export async function retryWhatsApp(contractId: string): Promise<RetryDeliveryStepResult> {
  return runContractDeliveryRetry(contractId, triggerContractWhatsApp);
}
