import { generateReceiptImage } from "@/lib/payment-receipt/generate-receipt-image";
import { findPublicReceipt } from "@/lib/payment-receipt/public-receipt";
import { receiptFileName } from "@/lib/payment-receipt/snapshot";

// payment-receipt R5 — the JPEG behind the public receipt viewer's `<img>` and
// its download button. Same reasoning as the contract viewer's image route
// (a real, cacheable URL instead of a base64 data URI), same lookup rules:
// by `receipt_token` only (spec §10), and one generic 404 for an unknown
// token, a cancelled contract, or a payment with no receipt.
//
// `?descargar=1` only switches `Content-Disposition` to `attachment` (some
// mobile browsers ignore the `download` attribute); it cannot change WHAT is
// served — the snapshot is the only input.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ receiptToken: string }> }
) {
  const { receiptToken } = await params;
  const snapshot = await findPublicReceipt(receiptToken);

  // Byte-identical to every other miss, and to the contract viewer's own 404.
  if (!snapshot) {
    return new Response("No encontrado", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }

  let image: Buffer;
  try {
    image = await generateReceiptImage(snapshot);
  } catch (error: unknown) {
    console.error(`Failed to render public receipt ${snapshot.paymentFolio}:`, error);
    return new Response("No se pudo generar el comprobante.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const disposition = new URL(request.url).searchParams.get("descargar") === "1" ? "attachment" : "inline";

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      "Content-Disposition": `${disposition}; filename="${receiptFileName(snapshot.paymentFolio)}"`,
      // `private`: the unguessable token is the only protection, so never a
      // shared cache. The bytes never change (frozen snapshot); the 5 minutes
      // bound how long a device keeps showing it after a cancellation.
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, noimageindex",
    },
  });
}
