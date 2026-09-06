import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

import { CreateServiceDialog } from "./create-service-dialog";
import { ServiceRowActions } from "./service-row-actions";

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
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Servicios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Solo el Super Usuario puede editar esta sección.
          </p>
        </div>
        <CreateServiceDialog categories={categoryOptions} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Opciones</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Ningún servicio registrado todavía.
                </TableCell>
              </TableRow>
            )}
            {services.map((service) => {
              const options = Array.isArray(service.options)
                ? (service.options as string[])
                : [];
              return (
                <TableRow key={service.id}>
                  <TableCell>{service.name}</TableCell>
                  <TableCell>{service.category.name}</TableCell>
                  <TableCell>
                    {options.length > 0 ? (
                      <Badge variant="info">{options.length} opciones</Badge>
                    ) : (
                      <span className="text-muted-foreground">Sin opciones</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ServiceRowActions
                      service={{
                        id: service.id,
                        name: service.name,
                        details: service.details,
                        categoryId: service.categoryId,
                        options,
                      }}
                      categories={categoryOptions}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
