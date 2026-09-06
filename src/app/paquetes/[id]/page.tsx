import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/ui/icon";

import { PackageBasicForm } from "./package-basic-form";
import { PackageServicesEditor } from "./package-services-editor";
import { PackagePricesEditor } from "./package-prices-editor";

interface PaqueteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PaqueteDetailPage({
  params,
}: PaqueteDetailPageProps) {
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

  const { id } = await params;

  const [pkg, categories, services, priceLists] = await Promise.all([
    prisma.package.findUnique({
      where: { id },
      include: { packageServices: true, packagePrices: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.service.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.priceList.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  if (!pkg) {
    notFound();
  }

  const selectedServiceIds = pkg.packageServices.map((ps) => ps.serviceId);
  const priceByListId = new Map(
    pkg.packagePrices.map((pp) => [pp.priceListId, Number(pp.price)])
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href="/paquetes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Icon icon={ArrowLeft} className="size-3.5" />
          Volver a paquetes
        </Link>
        <h1 className="mt-2 font-heading text-xl font-semibold">
          Editar paquete: {pkg.name}
        </h1>
      </div>

      <PackageBasicForm
        pkg={{
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          categoryId: pkg.categoryId,
          maxQuantity: pkg.maxQuantity,
          quantityUnit: pkg.quantityUnit,
        }}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
      />

      <PackageServicesEditor
        packageId={pkg.id}
        services={services.map((service) => ({
          id: service.id,
          name: service.name,
          categoryName: service.category.name,
        }))}
        selectedServiceIds={selectedServiceIds}
      />

      <PackagePricesEditor
        packageId={pkg.id}
        priceLists={priceLists.map((priceList) => ({
          id: priceList.id,
          name: priceList.name,
          isDefault: priceList.isDefault,
          price: priceByListId.get(priceList.id) ?? null,
        }))}
      />
    </div>
  );
}
