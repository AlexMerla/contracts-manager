import { prisma } from "@/lib/prisma";

import type { CatalogCategory } from "./types";

/**
 * The wizard's client-side catalog, shared by `/contratos/nuevo` and (since
 * edit-precontract) `/contratos/[id]/editar`, so both screens print the SAME
 * `PQ-xx` codes and the same live services/prices.
 *
 * @param includePackageIds packages to include even when inactive — the edit
 * screen passes the contract's own lines, which must stay visible and
 * keepable after the package was archived (spec §8.2 step 2).
 */
export async function loadWizardCatalog(includePackageIds: string[] = []): Promise<CatalogCategory[]> {
  // Synthetic `PQ-xx` codes must be IDENTICAL to the ones `/paquetes` prints,
  // so they are ranked over the same source: every package, ordered by
  // `createdAt` (catalog-pages-redesign D6). Ranking over the `active`-only
  // subset the wizard shows would renumber packages the moment one is
  // archived. Ids only — the display data comes from the query below.
  const allPackageIds = await prisma.package.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const packageCodes = new Map(
    allPackageIds.map((pkg, index) => [pkg.id, `PQ-${String(index + 1).padStart(2, "0")}`])
  );

  const rawCategories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      packages: {
        where:
          includePackageIds.length > 0
            ? { OR: [{ active: true }, { id: { in: includePackageIds } }] }
            : { active: true },
        orderBy: { name: "asc" },
        include: {
          packageServices: { include: { service: true } },
          packagePrices: true,
        },
      },
    },
  });

  return rawCategories
    .map((category) => ({
      id: category.id,
      name: category.name,
      packages: category.packages.map((pkg) => ({
        id: pkg.id,
        // `?? ""` is unreachable in practice (both queries read the same
        // table in the same request) — it only exists so the map lookup is
        // not silently widened to `string | undefined`.
        code: packageCodes.get(pkg.id) ?? "",
        name: pkg.name,
        description: pkg.description,
        categoryId: pkg.categoryId,
        categoryName: category.name,
        maxQuantity: pkg.maxQuantity,
        quantityUnit: pkg.quantityUnit,
        services: pkg.packageServices.map(({ service }) => ({
          id: service.id,
          name: service.name,
          options: Array.isArray(service.options) ? (service.options as string[]) : [],
        })),
        pricesByPriceListId: Object.fromEntries(
          pkg.packagePrices.map((price) => [price.priceListId, Number(price.price)])
        ),
      })),
    }))
    .filter((category) => category.packages.length > 0);
}
