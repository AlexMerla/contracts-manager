import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "node:path";

import { CONTRACT_TEMPLATE_FONT_FAMILY, drawWrappedText } from "./draw-wrapped-text";
import { CONTRACT_TEMPLATE_FIELDS, CONTRACT_TEMPLATE_HEIGHT, CONTRACT_TEMPLATE_WIDTH } from "./fields";
import { formatMoney } from "./format-money";

const TEMPLATE_PATH = path.join(process.cwd(), "src/lib/contract-template/assets/contract.jpg");
const FONT_PATH = path.join(process.cwd(), "src/lib/contract-template/assets/font.ttf");

// Registered once at module load, not per-call: @napi-rs/canvas has no
// built-in font with full Latin Extended-A coverage, so without this the
// generic "sans-serif" family falls back to whatever the OS resolves —
// which renders accented Spanish characters (í, ó, á, é, ñ-adjacent glyphs)
// as tofu boxes. Geist-Regular.ttf is vendored by `next` itself (used for
// @vercel/og image generation, which has the same "arbitrary text baked
// into an image" requirement we do), so it's already a project dependency
// with full glyph coverage — copied into assets/font.ttf rather than
// reaching into node_modules at runtime, since node_modules layout isn't a
// stable contract.
GlobalFonts.registerFromPath(FONT_PATH, CONTRACT_TEMPLATE_FONT_FAMILY);

// Matches the detail page's formatting (src/app/(app)/contratos/[id]/page.tsx)
// so the generated image and the on-screen contract detail read the same
// way. `eventTime` is stored as a Prisma `@db.Time` column, which Prisma
// returns as a `Date` anchored to 1970-01-01 UTC — formatting with
// timeZone: "UTC" avoids the local-timezone shift that would otherwise
// apply to that fake date.
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" });
const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export interface ContractImageServiceLine {
  name: string;
  quantity: number;
}

// Plain data shape, deliberately not `Prisma.Contract` — keeps this
// function testable with a hand-built object and reusable from both the
// confirm step (which already has this data in memory, no refetch needed)
// and the on-demand regeneration action (which fetches it fresh).
export interface ContractImageData {
  folio: string;
  eventDate: Date;
  eventTime: Date | null;
  clientName: string;
  eventType: string;
  clientAddress: string | null;
  // "Nombre XVñera, Novios ó Festejado:" on the template — see fields.ts
  // and tasks.md task 2 notes for the `celebrated` mapping decision.
  celebrated: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientMobile: string | null;
  placeName: string | null;
  placeAddress: string | null;
  services: ContractImageServiceLine[];
  total: number;
  deposit: number;
  balance: number;
}

function formatPlaceNameAddress(placeName: string | null, placeAddress: string | null): string {
  if (placeName && placeAddress) {
    return `${placeName} - ${placeAddress}`;
  }
  return placeName ?? placeAddress ?? "";
}

function formatServices(services: ContractImageServiceLine[]): string {
  return services
    .map((service) => (service.quantity > 1 ? `${service.quantity}x ${service.name}` : service.name))
    .join(", ");
}

// Spec §7 — loads the base JPEG template, draws every configured field via
// the shared wrapping helper, and outputs a JPEG buffer. This is the single
// place the app produces a contract image: both the confirm-step
// auto-generation and the on-demand regeneration endpoint call this same
// function with the same shaped input (task 6's "equivalent images for the
// same contract" requirement).
export async function generateContractImage(data: ContractImageData): Promise<Buffer> {
  const template = await loadImage(TEMPLATE_PATH);
  const canvas = createCanvas(CONTRACT_TEMPLATE_WIDTH, CONTRACT_TEMPLATE_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0, CONTRACT_TEMPLATE_WIDTH, CONTRACT_TEMPLATE_HEIGHT);

  const f = CONTRACT_TEMPLATE_FIELDS;

  drawWrappedText(ctx, dateFormatter.format(new Date()), f.fecha);
  drawWrappedText(ctx, data.folio, f.folio);
  drawWrappedText(ctx, dateFormatter.format(data.eventDate), f.eventDate);
  drawWrappedText(ctx, data.clientName, f.clientName);
  drawWrappedText(ctx, data.eventType, f.eventType);
  drawWrappedText(ctx, data.clientAddress ?? "", f.clientAddress);
  drawWrappedText(ctx, data.eventTime ? timeFormatter.format(data.eventTime) : "", f.eventTime);
  drawWrappedText(ctx, data.celebrated ?? "", f.celebrated);
  drawWrappedText(ctx, data.clientEmail ?? "", f.clientEmail);
  drawWrappedText(ctx, data.clientPhone ?? "", f.clientPhone);
  drawWrappedText(ctx, data.clientMobile ?? "", f.clientMobile);
  drawWrappedText(ctx, formatPlaceNameAddress(data.placeName, data.placeAddress), f.placeNameAddress);
  drawWrappedText(ctx, formatServices(data.services), f.services);
  drawWrappedText(ctx, formatMoney(data.total), f.total);
  // No I.V.A. field in this project's data model (spec §6.4 has no tax
  // column) — intentionally left blank, not drawn at all.
  drawWrappedText(ctx, formatMoney(data.deposit), f.deposit);
  drawWrappedText(ctx, formatMoney(data.balance), f.balance);

  return canvas.toBuffer("image/jpeg");
}
