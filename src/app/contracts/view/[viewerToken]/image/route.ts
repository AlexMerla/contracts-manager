import { getContractImageBuffer } from "@/lib/contract-template/get-contract-image-buffer";
import { prisma } from "@/lib/prisma";

// Sprint-07 task 1 (D4) — the JPEG bytes behind the public viewer's `<img>`.
//
// A dedicated route handler rather than a base64 `data:` URI inlined by the
// page's server component:
//  * the contract JPEG is a few hundred KB; base64 inflates it ~33% and the
//    result would be embedded TWICE in the response (once in the HTML, once
//    in the RSC flight payload) — a multi-megabyte page on a phone over
//    mobile data, which is exactly how the WhatsApp link gets opened;
//  * a real URL is cacheable, re-fetchable, and can be opened or saved on
//    its own; a data URI is none of those;
//  * it keeps a clean 404 for an unknown token, instead of the page having to
//    decide what to render for "token valid, rendering failed".
//
// Lookup is by `viewerToken` only, never by the internal `id` (spec §10), and
// only the OFFICIAL `"contract"` variant is ever served — the pre-contract
// render exists for the business's Drive archive, not for the client.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ viewerToken: string }> }
) {
  const { viewerToken } = await params;

  const contract = await prisma.contract.findUnique({
    where: { viewerToken },
    select: { id: true, folio: true },
  });

  // Byte-identical to any other miss: an unknown token must not be
  // distinguishable from a known one that happens to be missing.
  if (!contract) {
    return new Response("No encontrado", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }

  let image: Buffer;
  try {
    image = await getContractImageBuffer(contract.id, "contract");
  } catch (error: unknown) {
    console.error(`Failed to render the public image for contract ${contract.id}:`, error);
    return new Response("No se pudo generar la imagen del contrato.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      "Content-Disposition": `inline; filename="Contrato${contract.folio}.jpg"`,
      // `private`, not `public`: the URL's unguessable token is the only thing
      // protecting this, so it must never land in a shared CDN or proxy cache.
      // Five minutes is enough to cover a reload or a second device opening the
      // same link, and short enough that an edit plus a regeneration shows up
      // promptly — the image is derived data, re-rendered on every miss.
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, noimageindex",
    },
  });
}
