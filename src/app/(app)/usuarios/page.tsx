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

import { CreateUserDialog } from "./create-user-dialog";
import { UserRowActions } from "./user-row-actions";

export default async function UsuariosPage() {
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

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Solo el Super Usuario puede editar esta sección."
        actions={<CreateUserDialog />}
      />
      <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo electrónico</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "super" ? "ink" : "secondary"}>
                      {user.role === "super" ? "Super Usuario" : "Usuario Normal"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.active ? "success" : "danger"}>
                      {user.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      user={{
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        active: user.active,
                      }}
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
