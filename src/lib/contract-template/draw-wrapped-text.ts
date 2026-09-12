import type { SKRSContext2D } from "@napi-rs/canvas";

import type { ContractTemplateField } from "./fields";

const DEFAULT_FONT_SIZE = 22;
// 26px, not a larger "textbook" default, chosen empirically (see
// qa/generate-samples.ts's console output and fields.ts's layout notes) to
// keep a 2-3 line wrap from a long name/address from bleeding into the
// next field's y-coordinate given the ~48px gap between consecutive form
// fields on the template.
const DEFAULT_LINE_HEIGHT = 26;

// Family name the font registered via `GlobalFonts.registerFromPath` in
// generate-contract-image.ts is registered under. Must be registered
// before any `drawWrappedText` call runs, or `ctx.font` below silently
// falls back to the system's generic sans-serif (see bug notes in
// generate-contract-image.ts and specs/sprint-05-contract-image/tasks.md
// task 2).
export const CONTRACT_TEMPLATE_FONT_FAMILY = "ContractTemplateFont";

const ELLIPSIS = "…";

// Default when a field doesn't set `maxLines` — see fields.ts's
// `ContractTemplateField.maxLines` doc comment: every field is expected
// to declare an explicit value, this is only a last-resort fallback.
const DEFAULT_MAX_LINES = 1;

// Bug fix (sprint-05 follow-up verification pass): the original version
// of this function wrapped text within `maxWidth` but had NO cap on how
// many lines it would draw — a client name with 4 surnames, a long venue
// address, or a long eventType string would keep wrapping and drawing
// downward indefinitely, garbling into the label/field below (confirmed
// visually with `Read` on deliberately-longer-than-the-committed-samples
// test cases). The user's chosen fix is truncation, not limiting input
// length in the wizard's zod schemas: once wrapped `lines` exceeds the
// field's `maxLines`, this trims to exactly `maxLines` lines and appends
// "…" to the last one — re-trimming that last line word-by-word (then
// character-by-character as a last resort) so the ellipsis itself never
// pushes the line past `maxWidth`, using the same `ctx.measureText`
// technique already used for wrapping above.
function truncateLastLineWithEllipsis(ctx: SKRSContext2D, line: string, maxWidth: number): string {
  if (ctx.measureText(`${line}${ELLIPSIS}`).width <= maxWidth) {
    return `${line}${ELLIPSIS}`;
  }

  // Trim whole words first, so the truncation reads as a natural cutoff
  // ("Jardín de Eventos Los…") rather than a mid-word chop wherever
  // possible.
  const words = line.split(/\s+/).filter((word) => word.length > 0);
  while (words.length > 1) {
    words.pop();
    const candidate = `${words.join(" ")}${ELLIPSIS}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      return candidate;
    }
  }

  // Down to (or started with) a single word longer than `maxWidth` on
  // its own — fall back to a hard character-level trim, which is
  // acceptable per the chosen approach when a word boundary trim isn't
  // possible.
  let hardTrimmed = words[0] ?? line;
  while (hardTrimmed.length > 0 && ctx.measureText(`${hardTrimmed}${ELLIPSIS}`).width > maxWidth) {
    hardTrimmed = hardTrimmed.slice(0, -1);
  }
  return hardTrimmed.length > 0 ? `${hardTrimmed}${ELLIPSIS}` : ELLIPSIS;
}

// Spec §7: "implement a shared drawWrappedText(ctx, text, field) helper
// used for every field, not just the long ones" — every field in
// fields.ts is drawn through this, including short-looking ones like
// clientPhone, so a field is never at risk of overflow just because it
// looked short when the coordinates were picked.
//
// Returns the number of lines actually DRAWN (after truncation, if any),
// so callers (the QA script in particular, task 8) can check a field's
// wrapped block didn't run into the next field's y-coordinate without
// duplicating the wrapping logic.
export function drawWrappedText(
  ctx: SKRSContext2D,
  text: string,
  field: ContractTemplateField
): number {
  const fontSize = field.fontSize ?? DEFAULT_FONT_SIZE;
  const lineHeight = field.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const maxLines = field.maxLines ?? DEFAULT_MAX_LINES;
  ctx.font = `${fontSize}px ${CONTRACT_TEMPLATE_FONT_FAMILY}`;
  ctx.fillStyle = "#000000";

  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return 0;
  }

  const lines: string[] = [];
  let currentLine = words[0] as string;

  for (const word of words.slice(1)) {
    const candidate = `${currentLine} ${word}`;
    if (ctx.measureText(candidate).width <= field.maxWidth) {
      currentLine = candidate;
      continue;
    }
    lines.push(currentLine);
    currentLine = word;
  }
  lines.push(currentLine);

  let drawnLines = lines;
  if (lines.length > maxLines) {
    drawnLines = lines.slice(0, maxLines);
    const lastIndex = drawnLines.length - 1;
    drawnLines[lastIndex] = truncateLastLineWithEllipsis(
      ctx,
      drawnLines[lastIndex] as string,
      field.maxWidth
    );
  }

  drawnLines.forEach((line, index) => {
    ctx.fillText(line, field.x, field.y + index * lineHeight);
  });

  return drawnLines.length;
}
