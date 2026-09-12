import { describe, expect, it } from "vitest";

import {
  CONTRACT_TEMPLATE_FIELDS,
  CONTRACT_TEMPLATE_HEIGHT,
  CONTRACT_TEMPLATE_WIDTH,
} from "./fields";

// These coordinates were calibrated by visually inspecting grid-overlay
// renders of the template and the generated QA samples with the `Read`
// tool (see the note at the top of fields.ts) — this is a supplementary
// programmatic sanity check on top of that visual verification, not a
// substitute for it. It checks: (1) no field is placed off the canvas,
// and (2) within each of the template's two columns, fields that appear
// in vertical sequence keep enough spacing apart that one field's
// (possibly wrapped) text couldn't plausibly overlap the next one down
// the same column.
describe("CONTRACT_TEMPLATE_FIELDS", () => {
  it("keeps every field's origin within the canvas bounds", () => {
    for (const [name, field] of Object.entries(CONTRACT_TEMPLATE_FIELDS)) {
      expect(field.x, `${name}.x`).toBeGreaterThanOrEqual(0);
      expect(field.y, `${name}.y`).toBeGreaterThanOrEqual(0);
      expect(field.y, `${name}.y`).toBeLessThanOrEqual(CONTRACT_TEMPLATE_HEIGHT);
    }
  });

  it("keeps every field's max extent within the canvas width", () => {
    for (const [name, field] of Object.entries(CONTRACT_TEMPLATE_FIELDS)) {
      expect(field.x + field.maxWidth, `${name}.x + maxWidth`).toBeLessThanOrEqual(
        CONTRACT_TEMPLATE_WIDTH
      );
    }
  });

  // The form section is a two-column layout (see fields.ts) — each column
  // is its own top-to-bottom vertical sequence, and `placeNameAddress`
  // spans full width below both columns.
  const leftColumnOrder = ["clientName", "clientAddress", "celebrated", "clientPhone"] as const;
  const rightColumnOrder = ["eventDate", "eventType", "eventTime", "clientEmail", "clientMobile"] as const;

  const MIN_LINE_SPACING = 24;

  it("keeps at least a minimum line height between consecutive fields down each column", () => {
    for (const columnOrder of [leftColumnOrder, rightColumnOrder]) {
      for (let i = 1; i < columnOrder.length; i += 1) {
        const previous = CONTRACT_TEMPLATE_FIELDS[columnOrder[i - 1]];
        const current = CONTRACT_TEMPLATE_FIELDS[columnOrder[i]];
        expect(
          current.y - previous.y,
          `${columnOrder[i - 1]} -> ${columnOrder[i]} spacing`
        ).toBeGreaterThanOrEqual(MIN_LINE_SPACING);
      }
    }
  });

  it("keeps placeNameAddress (full-width row) below both columns' last row", () => {
    const { placeNameAddress, clientPhone, clientMobile } = CONTRACT_TEMPLATE_FIELDS;
    expect(placeNameAddress.y).toBeGreaterThan(clientPhone.y);
    expect(placeNameAddress.y).toBeGreaterThan(clientMobile.y);
  });

  it("keeps each row's left/right column pair from overlapping horizontally", () => {
    const pairs = [
      ["clientName", "eventType"],
      ["clientAddress", "eventTime"],
      ["celebrated", "clientEmail"],
      ["clientPhone", "clientMobile"],
    ] as const;
    for (const [leftName, rightName] of pairs) {
      const left = CONTRACT_TEMPLATE_FIELDS[leftName];
      const right = CONTRACT_TEMPLATE_FIELDS[rightName];
      expect(left.x + left.maxWidth, `${leftName} must not reach ${rightName}`).toBeLessThanOrEqual(
        right.x
      );
    }
  });

  it("keeps the amounts block (total/deposit/balance) spaced apart and after the services block", () => {
    const { services, total, deposit, balance } = CONTRACT_TEMPLATE_FIELDS;
    expect(total.y).toBeGreaterThan(services.y);
    expect(deposit.y - total.y).toBeGreaterThanOrEqual(MIN_LINE_SPACING);
    expect(balance.y - deposit.y).toBeGreaterThanOrEqual(MIN_LINE_SPACING);
  });
});
