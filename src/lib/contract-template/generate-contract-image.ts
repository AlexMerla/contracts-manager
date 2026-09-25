import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "node:path";

import { CONTRACT_TEMPLATE_FONT_FAMILY, drawWrappedText } from "./draw-wrapped-text";
import { CONTRACT_TEMPLATE_FIELDS, CONTRACT_TEMPLATE_HEIGHT, CONTRACT_TEMPLATE_WIDTH } from "./fields";
import { formatMoney } from "./format-money";

const ASSETS_DIR = path.join(process.cwd(), "src/lib/contract-template/assets");
const FONT_PATH = path.join(ASSETS_DIR, "font.ttf");

// Every contract is born `pre_contract` (Contract.contractStatus @default,
// spec §6.4) and both templates share ONE coordinate map (fields.ts) — the
// legacy events-manager implementation drew both with the same `fillText`
// block, varying only the base JPEG. Verified by rendering a real
// pre-contract sample and inspecting it: every field lands correctly, and
// the yellow legend box (left half, y≈1060-1160) clears the amounts column
// (x≈857).
export type ContractTemplateVariant = "contract" | "pre-contract";

const TEMPLATE_PATHS: Record<ContractTemplateVariant, string> = {
  contract: path.join(ASSETS_DIR, "contract.jpg"),
  "pre-contract": path.join(ASSETS_DIR, "pre-contract.jpg"),
};

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
// way. `eventDate` is a Prisma `@db.Date` column, materialised as UTC
// midnight — and `eventTime` is `@db.Time`, anchored to 1970-01-01 UTC —
// so both need `timeZone: "UTC"` or a negative-UTC-offset host prints the
// wrong calendar day (previously missing here: this formatted eventDate
// in the server's local zone, printing the day *before* the real one).
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" });
const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export interface ContractImageServiceLine {
  name: string;
  quantity: number;
  /** Read live from the catalog (`package.category.name`) — informational
   * grouping, not a money-owed field, so it is never snapshotted (unlike
   * `nameSnapshot`/`priceSnapshot`, spec §6.5). Matches the same live-join
   * decision already made for the Calendar description. */
  category: string | null;
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

// Legacy events-manager item format (`calendar.ts`'s `formatPackageLine` uses
// the same shape): `Nombre(xN) [Categoría]`. `(xN)` is only printed for N ≥ 2
// — a single-quantity line reads as just the name, matching this image's
// pre-existing behavior — and `[Categoría]` is only printed when a category
// is set; the two are independent of each other. Exported so the format is
// directly unit-testable rather than only indirectly via a rendered JPEG.
export function formatServices(services: ContractImageServiceLine[]): string {
  return services
    .map((service) => {
      const quantity = service.quantity > 1 ? `(x${service.quantity})` : "";
      const category = service.category ? ` [${service.category}]` : "";
      return `${service.name}${quantity}${category}`;
    })
    .join(", ");
}

// Spec §7 — loads the base JPEG template, draws every configured field via
// the shared wrapping helper, and outputs a JPEG buffer. This is the single
// place the app produces a contract image: both the confirm-step
// auto-generation and the on-demand regeneration endpoint call this same
// function with the same shaped input (task 6's "equivalent images for the
// same contract" requirement).
export async function generateContractImage(
  data: ContractImageData,
  variant: ContractTemplateVariant = "contract"
): Promise<Buffer> {
  const template = await loadImage(TEMPLATE_PATHS[variant]);
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

/** The official contract and the pre-contract, generated together and
 * all-or-nothing: no caller can hold half a pair. Sequential (not
 * `Promise.all`) because both renders share the process-wide `GlobalFonts`
 * registry and each allocates a full canvas; at ~2 contracts/week (spec
 * §4.2) overlap buys nothing. */
export interface ContractImagePair {
  contract: Buffer;
  preContract: Buffer;
}

export async function generateContractImages(data: ContractImageData): Promise<ContractImagePair> {
  const contract = await generateContractImage(data, "contract");
  const preContract = await generateContractImage(data, "pre-contract");
  return { contract, preContract };
}
