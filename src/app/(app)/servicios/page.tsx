import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

import { CreateServiceDialog } from "./create-service-dialog";
import { ServicesListView } from "./services-list-view";

export default async function ServiciosPage() {
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

  const [services, categories] = await Promise.all([
    prisma.service.findMany({
      include: { category: true, _count: { select: { packageServices: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  return (
    <>
      <PageHeader
        title="Servicios"
        subtitle="Solo el Super Usuario puede editar esta sección."
        actions={<CreateServiceDialog categories={categoryOptions} />}
      />
      <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
        <ServicesListView
          services={services.map((service) => {
            const options = Array.isArray(service.options)
              ? (service.options as string[])
              : [];
            return {
              id: service.id,
              name: service.name,
              details: service.details,
              categoryId: service.categoryId,
              categoryName: service.category.name,
              options,
              packageCount: service._count.packageServices,
            };
          })}
          categories={categoryOptions}
        />
      </div>
    </>
  );
}
