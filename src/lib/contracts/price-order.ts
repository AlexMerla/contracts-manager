import type { Prisma } from "@/generated/prisma/client";

// edit-precontract — the ONE pricing/validation loop for an order, shared by
// `createContract`, `createPublicPreContract` and `updateContract`. It used to
// be duplicated inline in the two create actions; a third copy for editing is
// exactly how the three would drift.
//
// It returns typed FAILURES, never copy: each caller owns its own wording
// (the public flow is deliberately generic so an anonymous caller cannot
// enumerate the catalog; the edit flow uses spec §8.2's copy). Check order is
// load-bearing and pinned by the characterization tests of both create
// actions: duplicates → (per line, in payload order) missing → inactive →
// max quantity → price → (after every line) required selections.

/** Anything with a `package` delegate: the bare client OR a transaction
 * client, so `updateContract` can price INSIDE its row lock. */
export type PackageReader = Pick<Prisma.TransactionClient, "package">;

export interface OrderLineInput {
  packageId: string;
  quantity: number;
}

export interface ServiceSelectionInput {
  serviceId: string;
  selectedOption: string;
}

/** A line the contract ALREADY has (edit only). Matched by `packageId`; its
 * snapshot wins over the live catalog (spec §6.5 / §8.2). */
export interface KeptLine {
  packageId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  quantity: number;
}

export interface PriceOrderInput {
  priceListId: string;
  orderLines: OrderLineInput[];
  serviceSelections: ServiceSelectionInput[];
  /** Omitted by the create flows. */
  keptLines?: KeptLine[];
}

export interface PricedLine {
  packageId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  quantity: number;
  /** Live category name — only for the image payload, never stored. */
  categoryName: string;
}

export type PriceOrderFailure =
  | { kind: "duplicate_package" }
  | { kind: "missing_package" }
  | { kind: "inactive_package"; packageName: string }
  | { kind: "over_max_quantity"; packageName: string; quantity: number; maxQuantity: number }
  | { kind: "unpriced_package"; packageName: string }
  | { kind: "missing_selection"; serviceName: string; packageName: string };

export type PriceOrderResult =
  | {
      ok: true;
      lines: PricedLine[];
      subtotal: number;
      /** Exactly one per REQUIRED service, in first-seen order; selections
       * for services no package in the order requires are dropped. */
      selections: ServiceSelectionInput[];
    }
  | { ok: false; failure: PriceOrderFailure };

interface RequiredService {
  name: string;
  options: string[];
  packageName: string;
}

export async function priceOrder(
  db: PackageReader,
  { priceListId, orderLines, serviceSelections, keptLines = [] }: PriceOrderInput
): Promise<PriceOrderResult> {
  const packageIds = orderLines.map((line) => line.packageId);
  if (new Set(packageIds).size !== packageIds.length) {
    return { ok: false, failure: { kind: "duplicate_package" } };
  }

  const packages = await db.package.findMany({
    where: { id: { in: packageIds } },
    include: {
      packagePrices: { where: { priceListId } },
      packageServices: { include: { service: true } },
      category: { select: { name: true } },
    },
  });
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const keptByPackageId = new Map(keptLines.map((line) => [line.packageId, line]));

  let subtotal = 0;
  const lines: PricedLine[] = [];
  const requiredServices = new Map<string, RequiredService>();

  for (const line of orderLines) {
    const pkg = packageById.get(line.packageId);
    if (!pkg) {
      return { ok: false, failure: { kind: "missing_package" } };
    }
    const kept = keptByPackageId.get(line.packageId);

    // A kept line skips the active check (spec §8.2: a package that became
    // inactive after the contract was signed stays valid on that contract).
    if (!kept && !pkg.active) {
      return { ok: false, failure: { kind: "inactive_package", packageName: pkg.name } };
    }

    // Live maxQuantity always applies to a new line; to a kept line only
    // when its quantity actually changes (an untouched line is grandfathered).
    const maxQuantity = pkg.maxQuantity ?? 1;
    const quantityChanged = !kept || kept.quantity !== line.quantity;
    if (quantityChanged && line.quantity > maxQuantity) {
      return {
        ok: false,
        failure: {
          kind: "over_max_quantity",
          packageName: kept?.nameSnapshot ?? pkg.name,
          quantity: line.quantity,
          maxQuantity,
        },
      };
    }

    let unitPrice: number;
    let name: string;
    if (kept) {
      // Snapshot wins — the client agreed to that unit price (spec §6.5).
      unitPrice = kept.priceSnapshot;
      name = kept.nameSnapshot;
    } else {
      const price = pkg.packagePrices[0]?.price;
      if (price == null) {
        return { ok: false, failure: { kind: "unpriced_package", packageName: pkg.name } };
      }
      unitPrice = Number(price);
      name = pkg.name;
    }

    subtotal += unitPrice * line.quantity;
    lines.push({
      packageId: pkg.id,
      nameSnapshot: name,
      priceSnapshot: unitPrice,
      quantity: line.quantity,
      categoryName: pkg.category.name,
    });

    // Required services are ALWAYS the live ones, kept line or not (spec
    // §8.2 step 3: selections are re-validated against live data).
    for (const { service } of pkg.packageServices) {
      const options = Array.isArray(service.options) ? (service.options as string[]) : [];
      if (options.length > 0 && !requiredServices.has(service.id)) {
        requiredServices.set(service.id, { name: service.name, options, packageName: name });
      }
    }
  }

  const selectionByServiceId = new Map(
    serviceSelections.map((selection) => [selection.serviceId, selection.selectedOption])
  );
  const selections: ServiceSelectionInput[] = [];
  for (const [serviceId, { name, options, packageName }] of requiredServices) {
    const selected = selectionByServiceId.get(serviceId);
    if (!selected || !options.includes(selected)) {
      return { ok: false, failure: { kind: "missing_selection", serviceName: name, packageName } };
    }
    selections.push({ serviceId, selectedOption: selected });
  }

  return { ok: true, lines, subtotal, selections };
}
