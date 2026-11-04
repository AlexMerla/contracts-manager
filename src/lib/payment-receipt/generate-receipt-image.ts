import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";

import { PAYMENT_STATUS_LABEL } from "@/components/status-pill";
import { formatMoney } from "@/lib/contract-template/format-money";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";
import { PAYMENT_CONCEPT_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/payments/labels";
import type { PaymentStatus } from "@/generated/prisma/enums";

import type { ReceiptSnapshot } from "./snapshot";

// payment-receipt — the receipt is drawn entirely in code (spec §7 exception:
// there is no designed receipt JPEG). Deterministic: the output depends ONLY
// on the snapshot (no `new Date()`, no database), so the email attachment, the
// public viewer and the staff download of one payment are the same picture,
// and nothing needs to be stored.

export const RECEIPT_WIDTH = 1080;
export const RECEIPT_HEIGHT = 1440;

const CONTRACT_ASSETS_DIR = path.join(process.cwd(), "src/lib/contract-template/assets");
const RECEIPT_ASSETS_DIR = path.join(process.cwd(), "src/lib/payment-receipt/assets");

const BRAND_TEMPLATE_PATH = path.join(CONTRACT_ASSETS_DIR, "contract.jpg");

/**
 * The brand block ("TODO CON UN SOLO PROVEEDOR" + "ALEX MERLA") inside
 * `contract.jpg` (1125x1466) — there is no standalone logo asset, so branding
 * is cropped from the contract template at render time and the receipt stays
 * visually in the contract's family. The ONLY place that knows these
 * coordinates: if the template image is ever replaced, re-measure here and
 * re-render `qa/receipt-sample.jpg`.
 */
export const RECEIPT_LOGO_SOURCE_RECT = { x: 186, y: 6, width: 468, height: 432 } as const;

// Separate family names (not one family with two weights): @napi-rs/canvas
// matches `ctx.font` weights against registered faces loosely, and two
// explicit families make every draw call say exactly which file it uses.
const FONT_REGULAR = "ReceiptGeist";
const FONT_SEMIBOLD = "ReceiptGeistSemiBold";

// Geist Regular is the same vendored file the contract image uses (copied
// from next's @vercel/og); Geist SemiBold is vendored from the `geist` npm
// package (v1.3.1, SIL OFL 1.1 — license next to the file). Assets, not
// dependencies.
GlobalFonts.registerFromPath(path.join(CONTRACT_ASSETS_DIR, "font.ttf"), FONT_REGULAR);
GlobalFonts.registerFromPath(path.join(RECEIPT_ASSETS_DIR, "geist-semibold.ttf"), FONT_SEMIBOLD);

// docs/design-system.md §1.1 tokens.
const INK = "#141720";
const TEXT_SECONDARY = "#4A5060";
const TEXT_MUTED = "#6B7180";
const LINE = "#E3E5EA";
const CANVAS_TINT = "#F6F7F9";

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, { background: string; foreground: string }> = {
  paid_in_full: { background: "#E6F5EE", foreground: "#0F6E44" },
  deposit_paid: { background: "#FCF2DE", foreground: "#8A5A08" },
  partial: { background: "#FCF2DE", foreground: "#8A5A08" },
  pending: { background: "#FCEAEC", foreground: "#9E2532" },
};
const SUCCESS_FOREGROUND = "#0F6E44";

const PADDING_X = 80;
const CONTENT_RIGHT = RECEIPT_WIDTH - PADDING_X;
const CONTENT_WIDTH = CONTENT_RIGHT - PADDING_X;
const VALUE_X = 330;

const BUSINESS_PHONES = "Teléfono / WhatsApp (81) 1157 0493 y (81) 8309 9393";
const BUSINESS_WEBSITE = "www.TodoConUnSoloProveedor.com";
const RECEIPT_LEGEND =
  "Este comprobante ampara únicamente el monto indicado. Conserve este documento para cualquier aclaración.";

const ELLIPSIS = "…";

/** dd/mm/aaaa (design-system §3) from `YYYY-MM-DD`, as a string slice: no
 * `Date` is built, so no time zone can shift the day. */
export function formatReceiptDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** The issue instant, as the calendar day in Mexico (spec §0). */
function formatIssuedAt(issuedAt: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(issuedAt));
  return formatReceiptDate(parts);
}

function money(cents: number): string {
  return formatMoney(cents / 100);
}

type Font = typeof FONT_REGULAR | typeof FONT_SEMIBOLD;

interface TextStyle {
  font: Font;
  size: number;
  color: string;
  align?: "left" | "right" | "center";
  /** CSS length, for UPPERCASE micro-labels (design-system "caps" tracking). */
  letterSpacing?: string;
}

function applyStyle(ctx: SKRSContext2D, style: TextStyle): void {
  ctx.font = `${style.size}px ${style.font}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align ?? "left";
  ctx.letterSpacing = style.letterSpacing ?? "0px";
}

function drawText(ctx: SKRSContext2D, text: string, x: number, y: number, style: TextStyle): void {
  applyStyle(ctx, style);
  ctx.fillText(text, x, y);
}

function ellipsize(ctx: SKRSContext2D, line: string, maxWidth: number): string {
  let trimmed = line;
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}${ELLIPSIS}`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }
  return `${trimmed}${ELLIPSIS}`;
}

/** Word-wraps `text` into at most `maxLines` lines no wider than `maxWidth`
 * (with the style already applied); the last line is ellipsized on overflow.
 * A single word wider than the line is hard-cut, never allowed to overflow. */
export function wrapLines(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = ctx.measureText(word).width <= maxWidth ? word : ellipsize(ctx, word, maxWidth);
  }
  if (current) {
    lines.push(current);
  }
  if (lines.length <= maxLines) {
    return lines;
  }
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(ctx, kept[maxLines - 1] as string, maxWidth);
  return kept;
}

function drawLines(
  ctx: SKRSContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  style: TextStyle
): number {
  applyStyle(ctx, style);
  for (const [index, line] of lines.entries()) {
    ctx.fillText(line, x, y + index * lineHeight);
  }
  return y + (lines.length - 1) * lineHeight;
}

function divider(ctx: SKRSContext2D, y: number): void {
  ctx.fillStyle = LINE;
  ctx.fillRect(PADDING_X, y, CONTENT_WIDTH, 2);
}

function roundedRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

const LABEL_STYLE: TextStyle = { font: FONT_SEMIBOLD, size: 20, color: TEXT_MUTED, letterSpacing: "2px" };

function drawLogo(ctx: SKRSContext2D, brand: Image): void {
  const rect = RECEIPT_LOGO_SOURCE_RECT;
  const height = 214;
  const width = Math.round((rect.width / rect.height) * height);
  ctx.drawImage(brand, rect.x, rect.y, rect.width, rect.height, PADDING_X - 12, 48, width, height);
}

function drawHeader(ctx: SKRSContext2D, snapshot: ReceiptSnapshot): void {
  drawText(ctx, "COMPROBANTE DE PAGO", CONTENT_RIGHT, 118, { ...LABEL_STYLE, size: 24, align: "right" });
  drawText(ctx, snapshot.paymentFolio, CONTENT_RIGHT, 190, {
    font: FONT_SEMIBOLD,
    size: 60,
    color: INK,
    align: "right",
  });
  drawText(ctx, `Emitido el ${formatIssuedAt(snapshot.issuedAt)}`, CONTENT_RIGHT, 236, {
    font: FONT_REGULAR,
    size: 26,
    color: TEXT_SECONDARY,
    align: "right",
  });
}

/** Label + value row; returns the baseline of the value's last line. */
function infoRow(ctx: SKRSContext2D, label: string, value: string, y: number, maxLines = 1): number {
  drawText(ctx, label, PADDING_X, y, LABEL_STYLE);
  const style: TextStyle = { font: FONT_REGULAR, size: 30, color: INK };
  applyStyle(ctx, style);
  const lines = wrapLines(ctx, value, CONTENT_RIGHT - VALUE_X, maxLines);
  return drawLines(ctx, lines, VALUE_X, y, 40, style);
}

function drawAmountBlock(ctx: SKRSContext2D, snapshot: ReceiptSnapshot, top: number): number {
  const center = RECEIPT_WIDTH / 2;
  const noteStyle: TextStyle = { font: FONT_REGULAR, size: 26, color: TEXT_SECONDARY, align: "center" };
  applyStyle(ctx, noteStyle);
  const noteLines = snapshot.note ? wrapLines(ctx, `Nota: ${snapshot.note}`, CONTENT_WIDTH - 80, 2) : [];
  const height = 250 + (noteLines.length > 0 ? noteLines.length * 36 + 14 : 0);

  ctx.fillStyle = CANVAS_TINT;
  roundedRect(ctx, PADDING_X, top, CONTENT_WIDTH, height, 18);

  drawText(ctx, "MONTO RECIBIDO", center, top + 56, { ...LABEL_STYLE, align: "center" });
  drawText(ctx, money(snapshot.amountCents), center, top + 158, {
    font: FONT_SEMIBOLD,
    size: 100,
    color: INK,
    align: "center",
    letterSpacing: "-2px",
  });
  const meta = [
    PAYMENT_CONCEPT_LABEL[snapshot.concept],
    PAYMENT_METHOD_LABEL[snapshot.method],
    `Pagado el ${formatReceiptDate(snapshot.paymentDate)}`,
  ].join(" · ");
  drawText(ctx, meta, center, top + 212, { font: FONT_REGULAR, size: 28, color: TEXT_SECONDARY, align: "center" });
  if (noteLines.length > 0) {
    drawLines(ctx, noteLines, center, top + 262, 36, noteStyle);
  }
  return top + height;
}

function summaryRow(ctx: SKRSContext2D, label: string, value: string, y: number, valueStyle?: Partial<TextStyle>): void {
  drawText(ctx, label, PADDING_X, y, { font: FONT_REGULAR, size: 30, color: TEXT_SECONDARY });
  drawText(ctx, value, CONTENT_RIGHT, y, { font: FONT_REGULAR, size: 30, color: INK, align: "right", ...valueStyle });
}

function drawStatusPill(ctx: SKRSContext2D, status: PaymentStatus, y: number): void {
  const colors = PAYMENT_STATUS_COLORS[status];
  const label = PAYMENT_STATUS_LABEL[status];
  const style: TextStyle = { font: FONT_SEMIBOLD, size: 24, color: colors.foreground, align: "right" };
  applyStyle(ctx, style);
  const textWidth = ctx.measureText(label).width;
  const dot = 12;
  const pillWidth = textWidth + dot + 64;
  const pillHeight = 46;
  ctx.fillStyle = colors.background;
  roundedRect(ctx, CONTENT_RIGHT - pillWidth, y - 32, pillWidth, pillHeight, pillHeight / 2);
  ctx.fillStyle = colors.foreground;
  ctx.beginPath();
  ctx.arc(CONTENT_RIGHT - pillWidth + 26, y - 9, dot / 2, 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, label, CONTENT_RIGHT - 24, y, style);
}

function drawFooter(ctx: SKRSContext2D, snapshot: ReceiptSnapshot): void {
  const center = RECEIPT_WIDTH / 2;
  const legendStyle: TextStyle = { font: FONT_REGULAR, size: 22, color: TEXT_MUTED, align: "center" };
  applyStyle(ctx, legendStyle);
  const legend = wrapLines(ctx, RECEIPT_LEGEND, CONTENT_WIDTH, 2);

  const websiteY = RECEIPT_HEIGHT - 60;
  const phonesY = websiteY - 40;
  const legendTop = phonesY - 44 - (legend.length - 1) * 30;
  const recordedY = legendTop - 46;

  divider(ctx, recordedY - 46);
  drawText(ctx, `Registrado por: ${snapshot.recordedByName}`, center, recordedY, {
    font: FONT_REGULAR,
    size: 22,
    color: TEXT_SECONDARY,
    align: "center",
  });
  drawLines(ctx, legend, center, legendTop, 30, legendStyle);
  drawText(ctx, BUSINESS_PHONES, center, phonesY, { font: FONT_REGULAR, size: 24, color: INK, align: "center" });
  drawText(ctx, BUSINESS_WEBSITE, center, websiteY, { font: FONT_SEMIBOLD, size: 26, color: INK, align: "center" });
}

let brandTemplate: Promise<Image> | null = null;

function loadBrandTemplate(): Promise<Image> {
  brandTemplate ??= loadImage(BRAND_TEMPLATE_PATH).catch((error: unknown) => {
    brandTemplate = null;
    throw error;
  });
  return brandTemplate;
}

/**
 * Renders one payment receipt (1080x1440 JPEG) from its frozen snapshot.
 * Throws only on an I/O failure loading the brand template; callers convert
 * that to their own step failure / 500.
 */
export async function generateReceiptImage(snapshot: ReceiptSnapshot): Promise<Buffer> {
  const brand = await loadBrandTemplate();
  const canvas = createCanvas(RECEIPT_WIDTH, RECEIPT_HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, RECEIPT_WIDTH, RECEIPT_HEIGHT);

  drawLogo(ctx, brand);
  drawHeader(ctx, snapshot);
  divider(ctx, 290);

  let y = infoRow(ctx, "CLIENTE", snapshot.clientName, 350, 2);
  y = infoRow(ctx, "CONTRATO", snapshot.contractFolio, y + 54);
  y = infoRow(
    ctx,
    "EVENTO",
    `${EVENT_TYPE_LABEL[snapshot.eventType]} · ${formatReceiptDate(snapshot.eventDate)}`,
    y + 54
  );

  y = drawAmountBlock(ctx, snapshot, y + 40);

  y += 64;
  summaryRow(ctx, "Total del contrato", money(snapshot.contractTotalCents), y);
  y += 50;
  summaryRow(ctx, "Pagado a la fecha (incluye este pago)", money(snapshot.totalPaidCents), y);
  y += 50;
  if (snapshot.balanceCents === 0) {
    summaryRow(ctx, "Saldo pendiente", "Liquidado", y, { font: FONT_SEMIBOLD, color: SUCCESS_FOREGROUND });
  } else {
    summaryRow(ctx, "Saldo pendiente", money(snapshot.balanceCents), y, { font: FONT_SEMIBOLD });
  }
  y += 58;
  drawText(ctx, "Estado de pago", PADDING_X, y, { font: FONT_REGULAR, size: 30, color: TEXT_SECONDARY });
  drawStatusPill(ctx, snapshot.paymentStatus, y);

  drawFooter(ctx, snapshot);

  return canvas.toBuffer("image/jpeg", 92);
}
