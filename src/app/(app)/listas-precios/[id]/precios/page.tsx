import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/page-header";

import { PriceListPricesEditor } from "./price-list-prices-editor";

interface PriceListPreciosPageProps {
  params: Promise<{ id: string }>;
}

export default async function PriceListPreciosPage({
  params,
}: PriceListPreciosPageProps) {
  const session = await auth();

  // Defense in depth alongside src/proxy.ts (spec §5) — `SUPER_ONLY_PREFIXES`
  // already covers this route since it starts with `/listas-precios` (D7),
  // this is the same second layer every other catalog page has.
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

  const priceList = await prisma.priceList.findUnique({ where: { id } });
  if (!priceList) {
    notFound();
  }

  // Inverse of package-prices-editor.tsx: one row per Package instead of one
  // row per PriceList. No synthetic display code shown here, so ordering by
  // name (rather than D6's createdAt) is fine.
  const packages = await prisma.package.findMany({
    orderBy: { name: "asc" },
    include: {
      category: true,
      packagePrices: { where: { priceListId: id } },
    },
  });

  return (
    <>
      <PageHeader
        title={`Precios: ${priceList.name}`}
        breadcrumb={
          <Link
            href="/listas-precios"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Icon icon={ArrowLeft} className="size-3.5" />
            Volver a listas de precios
          </Link>
        }
      />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-7 py-6">
        <PriceListPricesEditor
          priceListId={id}
          packages={packages.map((pkg) => ({
            packageId: pkg.id,
            packageName: pkg.name,
            categoryName: pkg.category.name,
            price: pkg.packagePrices[0] ? Number(pkg.packagePrices[0].price) : null,
          }))}
        />
      </div>
    </>
  );
}
