import { getGoogleConnection } from "@/lib/google/connection";
import { Alert } from "@/components/ui/alert";

interface GoogleConnectionBannerProps {
  role: "super" | "normal";
}

// Spec §5: visible to both roles, reconnect action only for `super`. Renders
// nothing once connected — per design-system.md §3 the alert only appears
// when there's an actual cause + action to report, never a bare "all good"
// status statement.
export async function GoogleConnectionBanner({ role }: GoogleConnectionBannerProps) {
  const status = await getGoogleConnection();

  if (status.connected) {
    return null;
  }

  const cause = status.lastError
    ? `No se pueden subir archivos a Drive ni crear eventos de calendario para contratos nuevos. Motivo: ${status.lastError}.`
    : "No se pueden subir archivos a Drive ni crear eventos de calendario para contratos nuevos.";

  return (
    <div className="mx-auto w-full max-w-[1280px] px-7 pt-4">
      <Alert
        tone="warning"
        title="La conexión con la cuenta de Google Master está desactivada."
        description={
          role === "super"
            ? `${cause} Reconecte la cuenta para restablecer estas funciones.`
            : `${cause} Un Super Usuario debe reconectarla.`
        }
        action={
          role === "super"
            ? { label: "Reconectar", href: "/api/google/connect" }
            : undefined
        }
      />
    </div>
  );
}
