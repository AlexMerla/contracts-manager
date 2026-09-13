import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

import { CreatePriceListDialog } from "./create-price-list-dialog";
import { PriceListsMasterDetail } from "./price-lists-master-detail";

interface ListasPreciosPageProps {
  searchParams: Promise<{ lista?: string }>;
}

export default async function ListasPreciosPage({
  searchParams,
}: ListasPreciosPageProps) {
  const session = await auth();

  // Defense in depth alongside src/proxy.ts (spec §5).
  try {
    requireRole(session, "super");
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const priceLists = await prisma.priceList.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { contracts: true } } },
  });

  const { lista } = await searchParams;
  // D1: the real dev DB currently has no `isDefault: true` row, so this
  // fallback is not a hypothetical edge case.
  const defaultList = priceLists.find((pl) => pl.isDefault) ?? priceLists[0];
  const selectedList = priceLists.find((pl) => pl.id === lista) ?? defaultList;

  // One round-trip covers both the selected list's prices and the default
  // list's prices (needed for VS GENERAL) — deduped to one id when the
  // selected list IS the default. Guarded for the (currently unreachable in
  // the real dev DB, but type-real) zero-price-lists case.
  const priceListIds = selectedList
    ? defaultList
      ? [...new Set([selectedList.id, defaultList.id])]
      : [selectedList.id]
    : [];

  const packages = selectedList
    ? await prisma.package.findMany({
        // D6: synthetic LP-xx/PQ-xx codes are derived from creation order —
        // ordering by name would make them appear shuffled.
        orderBy: { createdAt: "asc" },
        include: {
          category: true,
          packagePrices: { where: { priceListId: { in: priceListIds } } },
        },
      })
    : [];

  const priceListSummaries = priceLists.map((priceList, index) => ({
    id: priceList.id,
    code: `LP-${String(index + 1).padStart(2, "0")}`,
    name: priceList.name,
    contractCount: priceList._count.contracts,
    isDefault: priceList.isDefault,
    active: priceList.active,
  }));

  const selectedSummary =
    priceListSummaries.find((pl) => pl.id === selectedList?.id) ?? null;

  const rows = packages.map((pkg, index) => {
    const selectedPrice = selectedList
      ? (pkg.packagePrices.find((pp) => pp.priceListId === selectedList.id)?.price ?? null)
      : null;
    const defaultPrice = defaultList
      ? (pkg.packagePrices.find((pp) => pp.priceListId === defaultList.id)?.price ?? null)
      : null;

    return {
      id: pkg.id,
      code: `PQ-${String(index + 1).padStart(2, "0")}`,
      packageName: pkg.name,
      categoryName: pkg.category.name,
      unitLabel: pkg.maxQuantity
        ? `Hasta ${pkg.maxQuantity} ${pkg.quantityUnit ?? ""}`.trim()
        : "Cantidad fija (1)",
      price: selectedPrice != null ? Number(selectedPrice) : null,
      defaultPrice: defaultPrice != null ? Number(defaultPrice) : null,
    };
  });

  const catalogTotal = rows.some((row) => row.price != null)
    ? rows.reduce((sum, row) => sum + (row.price ?? 0), 0)
    : null;

  return (
    <>
      <PageHeader
        title="Listas de precios"
        subtitle="Solo el Super Usuario puede editar esta sección. Debe existir siempre exactamente una lista predeterminada."
        actions={<CreatePriceListDialog />}
      />
      <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
        <PriceListsMasterDetail
          priceLists={priceListSummaries}
          selected={selectedSummary}
          rows={rows}
          catalogTotal={catalogTotal}
        />
      </div>
    </>
  );
}
