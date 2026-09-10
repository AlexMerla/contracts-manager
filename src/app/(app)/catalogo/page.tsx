import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";

import { PriceListSwitcher } from "./price-list-switcher";

interface CatalogoPageProps {
  searchParams: Promise<{ lista?: string }>;
}

// Read-only browsing for both roles (spec §5: catalog is read-open, write
// is super-only). No forms, no server actions that mutate anything are
// reachable from this page — the enforcement for write endpoints lives in
// each catalog module's own `actions.ts` (each independently calls
// `requireRole(session, "super")`), per sprint-03 task 8's "rejected even if
// made directly" requirement.
export default async function CatalogoPage({
  searchParams,
}: CatalogoPageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const priceLists = await prisma.priceList.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  const { lista } = await searchParams;
  const defaultPriceList = priceLists.find((pl) => pl.isDefault) ?? priceLists[0];
  const selectedPriceList =
    priceLists.find((pl) => pl.id === lista) ?? defaultPriceList;

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      packages: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: {
          packageServices: { include: { service: true } },
          packagePrices: selectedPriceList
            ? { where: { priceListId: selectedPriceList.id } }
            : false,
        },
      },
    },
  });

  const categoriesWithPackages = categories.filter(
    (category) => category.packages.length > 0
  );

  return (
    <>
      <PageHeader
        title="Catálogo"
        subtitle="Consulte los paquetes disponibles, sus servicios incluidos y su precio según la lista seleccionada."
        actions={
          selectedPriceList &&
          priceLists.length > 0 && (
            <PriceListSwitcher
              priceLists={priceLists.map((pl) => ({
                id: pl.id,
                name: pl.name,
                isDefault: pl.isDefault,
              }))}
              selectedId={selectedPriceList.id}
            />
          )
        }
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-7 py-6">
        {!selectedPriceList && (
          <p className="text-sm text-muted-foreground">
            Ninguna lista de precios activa todavía.
          </p>
        )}

        {selectedPriceList && categoriesWithPackages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ningún paquete activo coincide con el catálogo todavía.
          </p>
        )}

        {selectedPriceList &&
          categoriesWithPackages.map((category) => (
            <div key={category.id} className="flex flex-col gap-3">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {category.name}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {category.packages.map((pkg) => {
                  const price = pkg.packagePrices[0]?.price ?? null;
                  return (
                    <Card key={pkg.id}>
                      <CardHeader>
                        <CardTitle>{pkg.name}</CardTitle>
                        {pkg.description && (
                          <CardDescription>{pkg.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <Money
                          amount={price != null ? Number(price) : null}
                          emptyLabel="Sin precio en esta lista"
                          className="font-heading text-lg font-semibold"
                        />
                        {pkg.maxQuantity && (
                          <p className="text-sm text-muted-foreground">
                            Hasta {pkg.maxQuantity} {pkg.quantityUnit ?? ""}
                          </p>
                        )}
                        {pkg.packageServices.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {pkg.packageServices.map(({ service }) => (
                              <Badge key={service.id} variant="secondary">
                                {service.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
