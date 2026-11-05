import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { paymentReceiptImagePath } from "@/lib/app-url";
import { formatMoney } from "@/lib/contract-template/format-money";
import { findPublicReceipt } from "@/lib/payment-receipt/public-receipt";
import { receiptFileName } from "@/lib/payment-receipt/snapshot";

// payment-receipt R5 / spec §10 — the unauthenticated receipt viewer: the
// destination of the WhatsApp link sent through HighLevel after a payment. Outside the
// `(app)` group on purpose (no shell, no session), and listed in
// src/proxy.ts's PUBLIC_PREFIXES.
//
// Everything shown comes from the frozen snapshot, never live contract data,
// and the internal payment/contract ids never reach the markup.

export const dynamic = "force-dynamic";

// One query per request, shared by generateMetadata and the page.
const findReceipt = cache(findPublicReceipt);

interface ReceiptViewerPageProps {
  params: Promise<{ receiptToken: string }>;
}

export async function generateMetadata({ params }: ReceiptViewerPageProps): Promise<Metadata> {
  const { receiptToken } = await params;
  const snapshot = await findReceipt(receiptToken);
  return {
    // A miss gets the brand alone — no hint of which kind of miss it was.
    title: snapshot ? "Comprobante de pago | Todo con un Solo Proveedor" : "Todo con un Solo Proveedor",
    robots: { index: false, follow: false },
  };
}

export default async function ReceiptViewerPage({ params }: ReceiptViewerPageProps) {
  const { receiptToken } = await params;
  const snapshot = await findReceipt(receiptToken);
  if (!snapshot) {
    notFound();
  }

  const imageUrl = paymentReceiptImagePath(receiptToken);
  const fileName = receiptFileName(snapshot.paymentFolio);

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Todo con un Solo Proveedor
        </p>
        <h1 className="font-display text-2xl font-semibold">
          Comprobante de pago <span className="font-mono">{snapshot.paymentFolio}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {snapshot.clientName} · {formatMoney(snapshot.amountCents / 100)} · Contrato{" "}
          <span className="font-mono">{snapshot.contractFolio}</span>
        </p>
      </header>

      {/* Plain <img>: the bytes come from a dynamic route handler. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={`Comprobante de pago ${snapshot.paymentFolio} de ${snapshot.clientName}`}
        className="w-full rounded-lg ring-1 shadow-sm ring-foreground/10"
      />

      <div>
        <Button render={<a href={`${imageUrl}?descargar=1`} download={fileName} />}>
          <Download aria-hidden="true" />
          Descargar comprobante
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Si algún dato no coincide con su pago, comuníquese con nosotros al (81) 1157 0493 o al (81)
        8309 9393.
      </p>
    </main>
  );
}
