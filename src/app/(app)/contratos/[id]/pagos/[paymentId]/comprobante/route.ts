import { z } from "zod";

import { auth } from "@/lib/auth";
import { scopeToOwner } from "@/lib/authorization";
import { generateReceiptImage } from "@/lib/payment-receipt/generate-receipt-image";
import { parseReceiptSnapshot, receiptFileName } from "@/lib/payment-receipt/snapshot";

// payment-receipt R6 — "Descargar comprobante" on every payment row. Staff
// only: behind the session (src/proxy.ts redirects anonymous requests before
// this runs; the check below is the route's own), and scoped at the data
// layer by `scopeToOwner` — a `normal` user asking for a payment of someone
// else's contract gets exactly the response a nonexistent payment gets.
//
// Unlike the public viewer, a CANCELLED contract is NOT refused here: the
// receipt is the business's own record of money received, and nothing in
// this route reaches the client. No Drive: rendered on demand from the frozen
// snapshot, so the file is identical to what the client was sent.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid(), paymentId: z.string().uuid() });

function notFound(): Response {
  return new Response("No se encontró el comprobante.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response("No autenticado.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // A malformed id would make Postgres reject the uuid cast (a 500); it can't
  // name a payment, so it is simply not found.
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return notFound();
  }
  const { id: contractId, paymentId } = parsed.data;

  const payment = await scopeToOwner(session).payment.findFirst({
    where: { id: paymentId, contractId },
    select: { receiptSnapshot: true },
  });
  const snapshot = payment ? parseReceiptSnapshot(payment.receiptSnapshot) : null;
  if (!snapshot) {
    return notFound();
  }

  let image: Buffer;
  try {
    image = await generateReceiptImage(snapshot);
  } catch (error: unknown) {
    console.error(`Failed to render receipt ${snapshot.paymentFolio} for download:`, error);
    return new Response("No se pudo generar el comprobante.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      // ASCII-only by construction (`ComprobantePG-0007.jpg`).
      "Content-Disposition": `attachment; filename="${receiptFileName(snapshot.paymentFolio)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
