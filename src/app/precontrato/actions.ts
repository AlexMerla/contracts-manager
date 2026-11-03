"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { runContractDeliveryPipeline } from "@/lib/contracts/delivery-pipeline";
import { isFolioCollision, nextFolio } from "@/lib/contracts/folio";
import { getHouseUserId } from "@/lib/contracts/house-user";
import { getPublicPriceList } from "@/lib/contracts/public-price-list";
import { calculateDefaultDeposit } from "@/lib/deposit";
import { getDepositThresholds } from "@/lib/deposit-config";
import { prisma } from "@/lib/prisma";
import { isPublicPreContractEnabled } from "@/lib/public-precontract";
import { verifyTurnstileToken } from "@/lib/turnstile";

import { createPublicPreContractSchema, type CreatePublicPreContractPayload } from "./schema";

// THE FIRST UNAUTHENTICATED WRITE ENDPOINT IN THIS CODEBASE.
//
// Deliberately NOT an extension of `createContract`
// (src/app/(app)/contratos/actions.ts). That action trusts the client's
// `discount`, `extraCharge`, `deposit` and `priceListId` verbatim, which is
// correct for a staff session and a hole on an anonymous one. Everything
// money-shaped here is derived server-side; the payload schema does not even
// declare those fields (see ./schema.ts).
//
// What IS shared with the internal path, on purpose:
//  * `nextFolio` — one global sequence, no separate public series (spec §6.4);
//  * `runContractDeliveryPipeline` — the identical §4.2 sequence, so the two
//    paths cannot drift;
//  * `contractDataSchema` — the same client-data validation and es-MX copy.

/** Never returns the internal `id` (spec §10) — the client gets its
 * `viewerToken` and its folio, nothing else. */
export type CreatePublicPreContractResult =
  | { error: string }
  | { success: true; viewerToken: string; folio: string };

/** Single generic message for every "this is not going to work right now"
 * case an anonymous caller could use to probe the system. */
const UNAVAILABLE =
  "Por el momento no podemos procesar su solicitud en línea. Comuníquese con nosotros y con gusto lo atendemos.";

const MAX_FOLIO_ATTEMPTS = 3;

export async function createPublicPreContract(
  input: CreatePublicPreContractPayload
): Promise<CreatePublicPreContractResult> {
  // Gate 1 — the env kill switch, checked before anything else so a disabled
  // deployment does no work at all (see @/lib/public-precontract).
  if (!isPublicPreContractEnabled()) {
    return { error: UNAVAILABLE };
  }

  const parsed = createPublicPreContractSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  // Gate 2 — Turnstile, BEFORE any database read or write. Fails closed
  // (see @/lib/turnstile): an unverifiable caller never reaches the catalog
  // query, never burns a folio, and never triggers the delivery pipeline.
  const requestHeaders = await headers();
  const turnstile = await verifyTurnstileToken(data.turnstileToken, {
    remoteIp: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  if (!turnstile.ok) {
    return { error: turnstile.message };
  }

  // Gate 3 — the owner. Resolved from the database, never from input.
  let createdById: string;
  try {
    createdById = await getHouseUserId();
  } catch (error: unknown) {
    console.error("Public pre-contract rejected — house user missing:", error);
    return { error: UNAVAILABLE };
  }

  // Gate 4 — the price list. Server-resolved, so a caller cannot price their
  // order against a cheaper list by sending its id.
  const priceList = await getPublicPriceList();
  if (!priceList) {
    return { error: UNAVAILABLE };
  }

  const packageIds = data.orderLines.map((line) => line.packageId);
  if (new Set(packageIds).size !== packageIds.length) {
    return { error: "Su pedido tiene paquetes repetidos." };
  }

  const packages = await prisma.package.findMany({
    where: { id: { in: packageIds } },
    include: {
      packagePrices: { where: { priceListId: priceList.id } },
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
  const requiredServices = new Map<string, { name: string; options: string[] }>();

  for (const line of data.orderLines) {
    const pkg = packageById.get(line.packageId);
    // Generic for a missing/inactive/unpriced package alike: an anonymous
    // caller must not be able to enumerate the catalog by error message.
    if (!pkg || !pkg.active) {
      return { error: "Alguno de los paquetes de su pedido ya no está disponible." };
    }

    const maxQuantity = pkg.maxQuantity ?? 1;
    if (line.quantity > maxQuantity) {
      return {
        error: `La cantidad de "${pkg.name}" excede el máximo permitido (${maxQuantity}).`,
      };
    }

    const price = pkg.packagePrices[0]?.price;
    if (price == null) {
      return { error: "Alguno de los paquetes de su pedido ya no está disponible." };
    }

    const unitPrice = Number(price);
    subtotal += unitPrice * line.quantity;

    contractPackagesData.push({
      packageId: pkg.id,
      // Spec §6.5 — the snapshot, same rule as the internal path.
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

  // ---- Amounts. None of this comes from the request. -----------------
  // Q4: the deposit is RECORDED as owed, never charged — there is no payment
  // gateway in this system and this change does not add one.
  const discount = null;
  const extraCharge = null;
  const total = subtotal;
  const deposit = calculateDefaultDeposit(total, getDepositThresholds());
  const balance = total - deposit;

  // The §6.4 threshold rule is a FLAT amount, so a small order just above the
  // threshold can propose a deposit larger than the total. Spec §8 step 5
  // exists so a human overrides that — and there is no human here. Refuse
  // cleanly BEFORE the transaction: no row, no folio, no pipeline.
  if (deposit > total) {
    return {
      error:
        "Su pedido requiere un anticipo mayor al total. Comuníquese con nosotros para armar su contrato.",
    };
  }

  const contractServiceSelectionsData = Array.from(requiredServices.keys()).map((serviceId) => ({
    serviceId,
    selectedOption: selectionByServiceId.get(serviceId) as string,
  }));

  const viewerToken = randomUUID();
  const {
    clientName,
    clientPhone,
    clientMobile,
    clientEmail,
    clientAddress,
    eventType,
    celebrated,
    eventDate,
    eventTime,
    placeName,
    placeAddress,
  } = data.contractData;

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
            discount,
            extraCharge,
            subtotal,
            total,
            deposit,
            balance,
            viewerToken,
            priceListId: priceList.id,
            createdById,
            // `contractStatus` defaults to `pre_contract` (schema.prisma) —
            // a client submission lands in exactly the state a staff draft
            // does. `registerPayment` is still what promotes it.
          },
        });

        if (contractPackagesData.length > 0) {
          await tx.contractPackage.createMany({
            data: contractPackagesData.map((line) => ({ ...line, contractId: created.id })),
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

      // Q2 — the FULL §4.2 pipeline fires automatically, identical to the
      // internal wizard's. Never throws, never fails the submission.
      await runContractDeliveryPipeline({ contractId: contract.id });

      return { success: true, viewerToken: contract.viewerToken, folio: contract.folio };
    } catch (error: unknown) {
      if (isFolioCollision(error) && attempt < MAX_FOLIO_ATTEMPTS) {
        continue;
      }
      // Unlike the internal action, nothing is re-thrown to the client: an
      // anonymous caller gets the generic message and the detail goes to the
      // server log only.
      console.error("Public pre-contract creation failed:", error);
      return { error: UNAVAILABLE };
    }
  }

  return { error: UNAVAILABLE };
}
