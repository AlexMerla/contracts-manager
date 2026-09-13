import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

import { CreateCategoryDialog } from "./create-category-dialog";
import { CategoriesListView } from "./categories-list-view";

export default async function CategoriasPage() {
  const session = await auth();

  // Defense in depth alongside src/proxy.ts (spec §5) — this page rejects on
  // its own even if it were ever reachable through a route the middleware
  // doesn't know about.
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

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { packages: true, services: true } } },
  });

  return (
    <>
      <PageHeader
        title="Categorías"
        subtitle="Solo el Super Usuario puede editar esta sección."
        actions={<CreateCategoryDialog />}
      />
      <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
        <CategoriesListView
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            packageCount: category._count.packages,
            serviceCount: category._count.services,
          }))}
        />
      </div>
    </>
  );
}
