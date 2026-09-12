// Spec §7 — single declarative config for every text field drawn onto the
// contract template JPEG (1125x1466px, see assets/contract.jpg). No x/y
// coordinate for this feature should exist anywhere outside this file.
//
// Coordinates below were calibrated visually: a grid-overlay JPEG was
// rendered on top of the blank template (every 50px, then zoomed crops
// every 10-20px around each row) and read back with the `Read` tool to
// find each printed label's actual pixel position, then every field's x/y
// was set relative to that. This IS possible in this environment — `Read`
// renders JPEGs visually, it does not just describe them in text. After
// each coordinate change, the 3 QA samples in qa/samples/ were
// regenerated and re-viewed with `Read` to confirm real placement, not
// just checked programmatically for bounds/overlap. See
// specs/sprint-05-contract-image/tasks.md task 2 and task 8 notes.
//
// The template's form section is a TWO-COLUMN layout: most rows have a
// left-column field and a right-column field side by side (e.g.
// `clientName` next to `eventType`). Fields are grouped below by row,
// left column first, then that row's right column.
export interface ContractTemplateField {
  /** Left edge, in pixels, where the drawn text starts. */
  x: number;
  /** Baseline y-coordinate, in pixels, of the first line. */
  y: number;
  /** Max width in pixels before `drawWrappedText` wraps to a new line. */
  maxWidth: number;
  /** Vertical distance between wrapped lines, in pixels. */
  lineHeight?: number;
  /** Font size in pixels. */
  fontSize?: number;
  /**
   * Maximum number of lines `drawWrappedText` will ever draw for this
   * field. Text that would wrap past this is truncated and the last drawn
   * line gets an "…" appended, so a field can NEVER grow tall enough to
   * bleed into the next field's `y` below it, no matter how long the
   * input is (see the bug this guards against: a field with no line cap
   * would keep wrapping and drawing downward indefinitely, garbling into
   * the label/field below).
   *
   * Defaults to 1 (`drawWrappedText` falls back to this when omitted) —
   * a field only gets a higher value when there's real evidence it needs
   * one: it was already deliberately tuned for a multi-line wrap (see the
   * per-field comments below), or — like `fecha` — it's known to
   * routinely wrap to more than 1 line by design. Every other field is
   * short-looking enough (a phone number, an amount, a single event type
   * word) that 1 line is the safe, conservative default; if real-world
   * data ever proves one of them needs more, bump it deliberately with
   * the same gap/lineHeight reasoning used below, not as a blanket bump.
   */
  maxLines?: number;
}

// Two pre-printed labels above the branded header graphic. The header
// artwork (logo box + photo) leaves only a narrow clear strip here, so
// `fecha` wraps to 2 short lines at a reduced font size rather than
// overlapping the pink swoosh graphic, and `folio` sits below the
// "Folio" label rather than beside it (nothing but hair/shoulder to its
// right at that y). `fecha`'s `maxLines: 2` isn't a defensive cap against
// long input (it's always today's date, a fixed-format string) — it's
// documenting the field's actual by-design 2-line wrap so
// `drawWrappedText`'s truncation logic doesn't clip its legitimate 2nd
// line down to 1.
const fecha: ContractTemplateField = {
  x: 170,
  y: 48,
  maxWidth: 150,
  fontSize: 16,
  lineHeight: 18,
  maxLines: 2,
};
const folio: ContractTemplateField = { x: 985, y: 148, maxWidth: 140, fontSize: 20, maxLines: 1 };

// Form fields section. The template is a TWO-COLUMN layout — each row
// below pairs a left-column field with a right-column field at a
// different x but the SAME y (row baseline). "Otro(s):" (row A's left
// column) is deliberately NOT included here — see the note in
// generate-contract-image.ts and specs/sprint-05-contract-image/tasks.md
// task 2 notes for why.

// Row A: (Otro(s) — blank, no field) | Fecha Del Evento. `eventDate` is a
// fixed-format `dateFormatter.format(...)` string (e.g. "20 de septiembre
// de 2027") — always fits on 1 line at this fontSize/maxWidth, no
// evidence it ever needs more.
const eventDate: ContractTemplateField = {
  x: 720,
  y: 615,
  maxWidth: 365,
  fontSize: 22,
  maxLines: 1,
};
// Row B: Nombre del Cliente | Tipo de Evento. `clientName` uses a smaller
// font + tighter lineHeight than the rest of the form: a full legal name
// (routinely long per Mexican naming convention — two given names plus
// paternal and maternal surnames) needs to wrap without its 2nd/3rd line
// dropping far enough to collide with row C (`clientAddress`) directly
// below it, given the template's fixed ~50px row spacing. `maxLines: 2`
// caps it at exactly the 2-line wrap this field was tuned for — a 3rd
// line would reach row C, so anything past 2 lines is truncated with "…"
// instead (see draw-wrapped-text.ts).
const clientName: ContractTemplateField = {
  x: 280,
  y: 662,
  maxWidth: 390,
  fontSize: 18,
  lineHeight: 22,
  maxLines: 2,
};
// `eventType` is a short catalog-style word/phrase ("Boda", "XV años") —
// 1 line is the safe default; no evidence it needs more.
const eventType: ContractTemplateField = {
  x: 875,
  y: 662,
  maxWidth: 210,
  fontSize: 22,
  maxLines: 1,
};
// Row C: Dirección (Cliente) | Horario de Evento. `clientAddress` has no
// prior 2-line tuning (unlike `clientName`/`placeNameAddress` below) and
// only ~70px of clearance to row D (`celebrated`) at this lineHeight —
// defaults to 1 line; an address longer than `maxWidth` truncates with
// "…" rather than risking a 2nd line crowding row D.
const clientAddress: ContractTemplateField = {
  x: 400,
  y: 712,
  maxWidth: 380,
  fontSize: 22,
  maxLines: 1,
};
const eventTime: ContractTemplateField = {
  x: 905,
  y: 715,
  maxWidth: 180,
  fontSize: 22,
  maxLines: 1,
};
// Row D: Nombre XVñera, Novios ó Festejado (2-line printed label, taller
// row) | Correo Electrónico. "Nombre XVñera, Novios ó Festejado:" is
// mapped to the `celebrated` column. The printed LABEL wraps to 2 lines,
// not the field value — a celebrant name is short, so `celebrated`
// defaults to 1 line same as any other short field.
const celebrated: ContractTemplateField = {
  x: 400,
  y: 782,
  maxWidth: 235,
  fontSize: 22,
  maxLines: 1,
};
const clientEmail: ContractTemplateField = {
  x: 835,
  y: 782,
  maxWidth: 250,
  fontSize: 22,
  maxLines: 1,
};
// Row E: Teléfono Local | Celular/Whatsapp
const clientPhone: ContractTemplateField = {
  x: 300,
  y: 833,
  maxWidth: 275,
  fontSize: 22,
  maxLines: 1,
};
const clientMobile: ContractTemplateField = {
  x: 745,
  y: 833,
  maxWidth: 340,
  fontSize: 22,
  maxLines: 1,
};
// Row F: Nombre y Dirección del Lugar — full width, combines placeName +
// placeAddress. Most likely field to wrap to multiple lines (a real venue
// name plus its full address routinely exceeds this width), and the
// template only leaves ~35px before the "Servicios Contratados" label
// printed directly below this row — smaller font + tight lineHeight than
// the rest of the form, same reasoning as `clientName` above, verified
// against the deliberately long combined name+address QA sample.
// `maxLines: 2` caps it at exactly that tuned wrap; a real venue name +
// full address that would need a 3rd line to display in full is
// truncated with "…" instead of reaching the "Servicios Contratados"
// label directly below.
const placeNameAddress: ContractTemplateField = {
  x: 440,
  y: 893,
  maxWidth: 640,
  fontSize: 13,
  lineHeight: 15,
  maxLines: 2,
};
// Row G: Servicios Contratados (ESPECIFICACIONES) — wide multi-line block
// drawn over the template's 3 ruled blank lines (at y=970/1010/1050), so
// lineHeight=40 puts each wrapped line's baseline just above one of them.
// `maxLines: 3` matches exactly those 3 ruled lines — a services list
// long enough to need a 4th line is truncated with "…" on the 3rd rather
// than drawing past the last ruled line into the amounts block below.
const services: ContractTemplateField = {
  x: 40,
  y: 965,
  maxWidth: 1050,
  lineHeight: 40,
  fontSize: 22,
  maxLines: 3,
};

// Money block: the template has its own "Total a Pagar:" / "I.V.A.:" /
// "Anticipo:" / "Resta:" labels in a boxed area above the signature lines
// (NOT at the bottom of the page). There is no I.V.A. field in this
// project's data model (spec §6.4 has no tax column) — left unfilled on
// purpose, see generate-contract-image.ts.
// Formatted money strings are always short and fixed-shape
// ("$12,345.50") — 1 line default, no evidence any of these three ever
// need more.
const total: ContractTemplateField = { x: 860, y: 1085, maxWidth: 210, fontSize: 22, maxLines: 1 };
const deposit: ContractTemplateField = { x: 860, y: 1143, maxWidth: 210, fontSize: 22, maxLines: 1 };
const balance: ContractTemplateField = { x: 860, y: 1173, maxWidth: 210, fontSize: 22, maxLines: 1 };

export const CONTRACT_TEMPLATE_FIELDS = {
  fecha,
  folio,
  eventDate,
  clientName,
  eventType,
  clientAddress,
  eventTime,
  celebrated,
  clientEmail,
  clientPhone,
  clientMobile,
  placeNameAddress,
  services,
  total,
  deposit,
  balance,
} as const satisfies Record<string, ContractTemplateField>;

export type ContractTemplateFieldName = keyof typeof CONTRACT_TEMPLATE_FIELDS;

export const CONTRACT_TEMPLATE_WIDTH = 1125;
export const CONTRACT_TEMPLATE_HEIGHT = 1466;
