import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDepositThresholds } from "@/lib/deposit-config";
import { PageHeader } from "@/components/page-header";

import { ContractWizard } from "./contract-wizard";
import type { CatalogCategory } from "./types";

// Spec §5: contract creation is open to both roles, so this only requires an
// authenticated session (no `requireRole`) — unlike the catalog CRUD pages,
// which are super-only.
export default async function NuevoContratoPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const priceLists = await prisma.priceList.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  const rawCategories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      packages: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: {
          packageServices: { include: { service: true } },
          packagePrices: true,
        },
      },
    },
  });

  const categories: CatalogCategory[] = rawCategories
    .map((category) => ({
      id: category.id,
      name: category.name,
      packages: category.packages.map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        categoryId: pkg.categoryId,
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

  const depositThresholds = getDepositThresholds();

  return (
    <>
      <PageHeader
        title="Nuevo contrato"
        subtitle="Arme el pedido, resuelva las opciones de servicio y confirme los montos."
      />
      <ContractWizard
        priceLists={priceLists.map((priceList) => ({
          id: priceList.id,
          name: priceList.name,
          isDefault: priceList.isDefault,
        }))}
        categories={categories}
        depositThresholds={depositThresholds}
      />
    </>
  );
}
