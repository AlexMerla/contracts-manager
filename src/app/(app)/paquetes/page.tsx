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
import { PageHeader } from "@/components/page-header";

import { CreatePackageDialog } from "./create-package-dialog";
import { PackageRowActions } from "./package-row-actions";

export default async function PaquetesPage() {
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

  const [packages, categories] = await Promise.all([
    prisma.package.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
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
      <div className="mx-auto w-full max-w-5xl px-7 py-6">
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Ningún paquete registrado todavía.
                  </TableCell>
                </TableRow>
              )}
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell>{pkg.name}</TableCell>
                  <TableCell>{pkg.category.name}</TableCell>
                  <TableCell>
                    {pkg.maxQuantity
                      ? `Hasta ${pkg.maxQuantity} ${pkg.quantityUnit ?? ""}`.trim()
                      : "Cantidad fija (1)"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={pkg.active ? "success" : "danger"}>
                      {pkg.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <PackageRowActions
                      pkg={{ id: pkg.id, name: pkg.name, active: pkg.active }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
