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

import { CreatePriceListDialog } from "./create-price-list-dialog";
import { PriceListRowActions } from "./price-list-row-actions";

export default async function ListasPreciosPage() {
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

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">
            Listas de precios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Solo el Super Usuario puede editar esta sección. Debe existir
            siempre exactamente una lista predeterminada.
          </p>
        </div>
        <CreatePriceListDialog />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Predeterminada</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {priceLists.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Ninguna lista de precios registrada todavía.
                </TableCell>
              </TableRow>
            )}
            {priceLists.map((priceList) => (
              <TableRow key={priceList.id}>
                <TableCell>{priceList.name}</TableCell>
                <TableCell>
                  {priceList.isDefault && (
                    <Badge variant="info">Predeterminada</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={priceList.active ? "success" : "danger"}>
                    {priceList.active ? "Activa" : "Inactiva"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <PriceListRowActions
                    priceList={{
                      id: priceList.id,
                      name: priceList.name,
                      isDefault: priceList.isDefault,
                      active: priceList.active,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
