import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { contractViewerImagePath } from "@/lib/app-url";
import { clientFacingImage } from "@/lib/contract-template/client-facing-variant";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";
import { prisma } from "@/lib/prisma";

// Sprint-07 task 1 / spec §10 — the unauthenticated contract viewer. This is
// the destination of the WhatsApp link ManyChat sends and of the button in
// the client's email.
//
// It lives OUTSIDE the `(app)` route group on purpose: no `AppShell`, no
// sidebar, no Google-connection banner, and no session. `src/proxy.ts` must
// list `/contracts/view` as public — without that, the edge guard redirects
// the client to /login before this ever renders.

export const dynamic = "force-dynamic";

// Spec §10: looked up by `viewerToken` ONLY. The internal `id` is never read
// into the markup, so it cannot leak through the page either. Wrapped in
// React's `cache` so `generateMetadata` and the page share ONE query per
// request instead of each hitting the DB.
const findViewerContract = cache(async (viewerToken: string) =>
  prisma.contract.findUnique({
    where: { viewerToken },
    select: {
      folio: true,
      clientName: true,
      eventType: true,
      eventDate: true,
      contractStatus: true,
    },
  })
);

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  // `eventDate` is `@db.Date` → UTC midnight; formatting in the server's own
  // zone would print the previous day on a negative-offset host.
  timeZone: "UTC",
});

interface ContractViewerPageProps {
  params: Promise<{ viewerToken: string }>;
}

export async function generateMetadata({ params }: ContractViewerPageProps): Promise<Metadata> {
  const { viewerToken } = await params;
  const contract = await findViewerContract(viewerToken);
  const clientImage = contract ? clientFacingImage(contract.contractStatus) : null;

  return {
    // A miss gets the brand alone — the page itself renders the 404, and the
    // title must not hint at which kind of miss it was.
    title: clientImage
      ? `${clientImage.label} | Todo con un Solo Proveedor`
      : "Todo con un Solo Proveedor",
    // Never let a search engine index a client's contract, even if a link leaks.
    robots: { index: false, follow: false },
  };
}

export default async function ContractViewerPage({ params }: ContractViewerPageProps) {
  const { viewerToken } = await params;
  const contract = await findViewerContract(viewerToken);
  // Spec §7: the CURRENT status picks what the client sees — "Precontrato"
  // until the deposit confirms it, "Contrato" after; `null` when cancelled.
  const clientImage = contract ? clientFacingImage(contract.contractStatus) : null;

  // One generic not-found for an unknown token, a malformed token, and a
  // cancelled contract alike — nothing here tells a prober which it was.
  if (!contract || !clientImage) {
    notFound();
  }

  const imageUrl = contractViewerImagePath(viewerToken, clientImage.variant);

  return (
    <main className="mx-auto flex w-full max-w-[920px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Todo con un Solo Proveedor
        </p>
        <h1 className="font-display text-2xl font-semibold">
          {clientImage.label} <span className="font-mono">{contract.folio}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {contract.clientName} · {EVENT_TYPE_LABEL[contract.eventType]} del{" "}
          {dateFormatter.format(contract.eventDate)}
        </p>
      </header>

      {/* Plain <img>, not next/image: the bytes come from a dynamic route
          handler that regenerates them per request, so Next's optimizer has
          nothing to optimise and would only add a second render pass. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={`${clientImage.label} ${contract.folio} de ${contract.clientName}`}
        className="w-full rounded-lg ring-1 shadow-sm ring-foreground/10"
      />

      <p className="text-sm text-muted-foreground">
        Si algún dato requiere corrección, comuníquese con nosotros antes de realizar el
        pago.
      </p>
    </main>
  );
}
