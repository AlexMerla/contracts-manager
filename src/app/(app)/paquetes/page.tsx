import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

import { CreatePackageDialog } from "./create-package-dialog";
import { PackagesGridView } from "./packages-grid-view";

interface PaquetesPageProps {
  searchParams: Promise<{ lista?: string }>;
}

export default async function PaquetesPage({ searchParams }: PaquetesPageProps) {
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
  });

  const { lista } = await searchParams;
  // D1: no price list is guaranteed `isDefault: true` in the real dev DB —
  // every lookup falls back to the first list.
  const defaultPriceList = priceLists.find((pl) => pl.isDefault) ?? priceLists[0];
  const selectedPriceList =
    priceLists.find((pl) => pl.id === lista) ?? defaultPriceList;

  const [packages, categories] = await Promise.all([
    prisma.package.findMany({
      // D6: synthetic PQ-xx codes are derived from creation order — ordering
      // by name would make the codes appear shuffled.
      orderBy: { createdAt: "asc" },
      include: {
        category: true,
        // catalogo/page.tsx's shape, not the shallower [id]/page.tsx shape —
        // this grid needs service names for the card body.
        packageServices: { include: { service: true } },
        _count: { select: { contractPackages: true } },
        packagePrices: selectedPriceList
          ? { where: { priceListId: selectedPriceList.id } }
          : false,
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Paquetes"
        subtitle="Solo el Super Usuario puede editar esta sección. Los servicios incluidos y los precios por lista se administran desde la pantalla de edición de cada paquete."
        actions={
          <CreatePackageDialog
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
            }))}
          />
        }
      />
      <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
        <PackagesGridView
          packages={packages.map((pkg, index) => ({
            id: pkg.id,
            code: `PQ-${String(index + 1).padStart(2, "0")}`,
            name: pkg.name,
            description: pkg.description,
            categoryId: pkg.categoryId,
            categoryName: pkg.category.name,
            quantityLabel: pkg.maxQuantity
              ? `Hasta ${pkg.maxQuantity} ${pkg.quantityUnit ?? ""}`.trim()
              : "Cantidad fija (1)",
            active: pkg.active,
            contractCount: pkg._count.contractPackages,
            serviceNames: pkg.packageServices.map(({ service }) => service.name),
            price: pkg.packagePrices[0] ? Number(pkg.packagePrices[0].price) : null,
          }))}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))}
          priceLists={priceLists.map((pl) => ({
            id: pl.id,
            name: pl.name,
            isDefault: pl.isDefault,
          }))}
          selectedPriceListId={selectedPriceList?.id ?? null}
          selectedPriceListName={selectedPriceList?.name ?? null}
        />
      </div>
    </>
  );
}
