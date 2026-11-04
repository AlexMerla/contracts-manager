// payment-receipt R5 / spec §10: the one generic response for an unknown
// token, a malformed one, a cancelled contract and a payment with no receipt.
// Same copy as the contract viewer's not-found — a prober learns nothing,
// including which of the two public viewers a token belonged to.
export default function ReceiptViewerNotFound() {
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
