"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { requireRole, scopeToOwner } from "@/lib/authorization";
import { getContractImageBuffers } from "@/lib/contract-template/get-contract-image-buffer";
import { runContractDeliveryPipeline } from "@/lib/contracts/delivery-pipeline";
import type { ContractDeliveryStepResult } from "@/lib/contracts/delivery-step";
import { isFolioCollision, nextFolio } from "@/lib/contracts/folio";
import { priceOrder, type PriceOrderFailure } from "@/lib/contracts/price-order";
import { sendContractEmail } from "@/lib/email/contract-email";
import { upsertContractCalendarEvent } from "@/lib/google/calendar";
import { uploadContractImageToDrive } from "@/lib/google/drive";
import { triggerContractWhatsApp } from "@/lib/whatsapp/manychat";
import { prisma } from "@/lib/prisma";
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

// The internal flow's copy, unchanged by the extraction (pinned by the
// characterization tests in contratos-actions.test.ts).
function createFailureMessage(failure: PriceOrderFailure): string {
  switch (failure.kind) {
    case "duplicate_package":
      return "El pedido tiene paquetes duplicados.";
    case "missing_package":
      return "Uno o más paquetes del pedido ya no existen.";
    case "inactive_package":
      return `El paquete "${failure.packageName}" ya no está activo.`;
    case "over_max_quantity":
      return `La cantidad de "${failure.packageName}" (${failure.quantity}) excede el máximo permitido (${failure.maxQuantity}).`;
    case "unpriced_package":
      return `El paquete "${failure.packageName}" no tiene precio en la lista seleccionada.`;
    case "missing_selection":
      return `Falta elegir una opción para el servicio "${failure.serviceName}".`;
  }
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
  // rows, and `Package` isn't an owner-scoped model at all. Names, prices
  // and the required-service set are resolved server-side by the shared
  // `priceOrder` (edit-precontract extracted it; copy below is unchanged).
  const priced = await priceOrder(prisma, {
    priceListId: data.priceListId,
    orderLines: data.orderLines,
    serviceSelections: data.serviceSelections,
  });
  if (!priced.ok) {
    return { error: createFailureMessage(priced.failure) };
  }
  const { subtotal, lines: contractPackageLines, selections: contractServiceSelectionsData } = priced;
  const contractPackagesData = contractPackageLines.map(
    ({ packageId, nameSnapshot, priceSnapshot, quantity }) => ({
      packageId,
      nameSnapshot,
      priceSnapshot,
      quantity,
    })
  );

  const discount = data.discount ?? 0;
  const extraCharge = data.extraCharge ?? 0;
  const total = subtotal - discount + extraCharge;
  const balance = total - data.deposit;
  const viewerToken = randomUUID();

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

      // Spec §4.2's full sequential pipeline (image → Drive → Calendar →
      // email → WhatsApp), extracted to `@/lib/contracts/delivery-pipeline`
      // so the public pre-contract action runs the IDENTICAL sequence rather
      // than a second copy that can drift. Behavior here is unchanged: the
      // image data assembled in this request is handed over, so this path
      // still renders without a second read of the row it just wrote.
      await runContractDeliveryPipeline({
        contractId: contract.id,
        imageData: {
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
          services: contractPackageLines.map((line) => ({
            name: line.nameSnapshot,
            quantity: line.quantity,
            category: line.categoryName,
          })),
          total,
          deposit: data.deposit,
          balance,
        },
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
