import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { getGoogleConnection } from "@/lib/google/connection";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeStyle: "short",
});

interface GoogleSettingsPageProps {
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function GoogleSettingsPage({ searchParams }: GoogleSettingsPageProps) {
  const session = await auth();

  // Defense in depth alongside src/proxy.ts (spec §5: reconnect action is
  // super-only; a `normal` user already sees connection status via the
  // global banner and has no reason to reach this page).
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

  const { success, error } = await searchParams;
  const status = await getGoogleConnection();

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Conexión de la cuenta de Google Master (Drive y Calendario)."
      />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-7 py-6">
        {success ? (
          <Alert
            tone="success"
            title="Conexión completada."
            description="La cuenta de Google Master quedó conectada. Los próximos contratos podrán subir su documento a Drive y crear su evento de calendario."
          />
        ) : null}
        {error ? (
          <Alert
            tone="danger"
            title="No se pudo completar la conexión con Google."
            description={error}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Google Master</CardTitle>
            <CardDescription>
              Esta es la única cuenta de Google que usa el sistema para subir contratos a Drive
              y crear eventos de calendario (spec §4.3) — es independiente del inicio de sesión
              de los usuarios.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {status.connectedEmail ? (
                <span className="text-sm">{status.connectedEmail}</span>
              ) : (
                <span className="text-sm font-medium">Estado:</span>
              )}
              <Badge variant={status.connected ? "success" : "danger"} dot>
                {status.connected ? "Conectada" : "Desconectada"}
              </Badge>
            </div>

            {status.connectedAt ? (
              <p className="text-sm text-muted-foreground">
                Última conexión: {dateTimeFormatter.format(status.connectedAt)}.
              </p>
            ) : null}

            {status.lastError ? (
              <Alert
                tone="warning"
                title="Último error registrado."
                description={status.lastError}
              />
            ) : null}

            <div>
              <Button render={<a href="/api/google/connect" />}>
                {status.connected ? "Reconectar cuenta" : "Conectar cuenta"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
