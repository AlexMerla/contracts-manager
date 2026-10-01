// Spec §10 / sprint-07 task 1: the single generic response for an unknown
// token, a malformed token, and a cancelled contract. It deliberately says
// nothing about whether the link ever existed — a prober learns the same
// thing from every token they try. Scoped to this route segment so the
// client sees Spanish, client-facing copy instead of the admin 404.
export default function ContractViewerNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-3 px-5 py-20 text-center">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Todo con un Solo Proveedor
      </p>
      <h1 className="font-display text-xl font-semibold">Este enlace no está disponible</h1>
      <p className="text-sm text-muted-foreground">
        Revise que el enlace esté completo o solicítenos uno nuevo.
      </p>
    </main>
  );
}
