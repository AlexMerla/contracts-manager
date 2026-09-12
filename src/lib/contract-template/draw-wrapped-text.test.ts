import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";

import { drawWrappedText } from "./draw-wrapped-text";
import type { ContractTemplateField } from "./fields";

// Spec §7 / sprint-05 task 3: "a field whose text exceeds its maxWidth
// wraps to multiple lines instead of overflowing, verified with a
// deliberately long test string in at least one short-looking field (e.g.
// venue address)." `clientAddress` is exactly that kind of field — narrow
// enough to look like a one-liner, but it uses the same shared helper as
// every other field, so a long address must still wrap.
describe("drawWrappedText", () => {
  function makeContext() {
    const canvas = createCanvas(1125, 1466);
    return canvas.getContext("2d");
  }

  it("draws a short string as a single line", () => {
    const ctx = makeContext();
    const field: ContractTemplateField = { x: 460, y: 664, maxWidth: 600, fontSize: 22 };

    const lineCount = drawWrappedText(ctx, "Av. Reforma 123", field);

    expect(lineCount).toBe(1);
  });

  it("wraps a deliberately long address across multiple lines", () => {
    const ctx = makeContext();
    // clientAddress's real x/y/maxWidth/fontSize from fields.ts, but with
    // a generous maxLines here specifically to exercise the WRAPPING
    // logic in isolation from the truncation cap tested separately below
    // (the real clientAddress field defaults to maxLines: 1, which would
    // truncate this deliberately-long string to a single "…"-ending line
    // and defeat the point of this test).
    const field: ContractTemplateField = {
      x: 460,
      y: 664,
      maxWidth: 600,
      fontSize: 22,
      maxLines: 10,
    };
    const longAddress =
      "Avenida Insurgentes Sur número 1234, Colonia Del Valle Centro, entre las calles de " +
      "Xochicalco y Eje 5 Poniente, Ciudad de México, código postal 03100, frente al parque central";

    const lineCount = drawWrappedText(ctx, longAddress, field);

    expect(lineCount).toBeGreaterThan(1);
  });

  it("does not throw and returns 0 for an empty string", () => {
    const ctx = makeContext();
    const field: ContractTemplateField = { x: 460, y: 664, maxWidth: 600, fontSize: 22 };

    expect(drawWrappedText(ctx, "", field)).toBe(0);
  });

  // Bug fix (verified by an independent sdd-verify pass): the wrapping
  // loop above had no cap on line count, so a field with no `maxLines`
  // (or a field whose real-world input exceeds the number of lines it
  // was tuned for) would keep wrapping and drawing downward
  // indefinitely, garbling into the next field's label below it. Fixed
  // by truncating to `field.maxLines` and appending "…" to the last
  // drawn line — these tests assert the returned line count is capped
  // AND that the actually-drawn text ends in the ellipsis, by spying on
  // `ctx.fillText` (the same technique used elsewhere in this suite to
  // inspect drawn output, applied here since the wrapping logic itself
  // decides what gets passed to `fillText`).
  describe("line-count truncation", () => {
    it("caps the returned line count at field.maxLines and never exceeds it", () => {
      const ctx = makeContext();
      const field: ContractTemplateField = {
        x: 280,
        y: 662,
        maxWidth: 390,
        fontSize: 18,
        maxLines: 2,
      };
      const veryLongName =
        "María Fernanda de la Concepción Hernández Rodríguez de los Santos Martínez del Campo " +
        "Gutiérrez Villaseñor de la Torre y Mendoza";

      const lineCount = drawWrappedText(ctx, veryLongName, field);

      expect(lineCount).toBe(2);
    });

    it("appends an ellipsis to the last rendered line when text is truncated", () => {
      const ctx = makeContext();
      const fillTextSpy = vi.spyOn(ctx, "fillText");
      const field: ContractTemplateField = {
        x: 280,
        y: 662,
        maxWidth: 390,
        fontSize: 18,
        maxLines: 2,
      };
      const veryLongName =
        "María Fernanda de la Concepción Hernández Rodríguez de los Santos Martínez del Campo " +
        "Gutiérrez Villaseñor de la Torre y Mendoza";

      drawWrappedText(ctx, veryLongName, field);

      expect(fillTextSpy).toHaveBeenCalledTimes(2);
      const lastCallText = fillTextSpy.mock.calls[fillTextSpy.mock.calls.length - 1]?.[0];
      expect(lastCallText).toMatch(/…$/);
    });

    it("keeps the truncated + ellipsis line within maxWidth", () => {
      const ctx = makeContext();
      const fillTextSpy = vi.spyOn(ctx, "fillText");
      const field: ContractTemplateField = {
        x: 280,
        y: 662,
        maxWidth: 390,
        fontSize: 18,
        maxLines: 2,
      };
      const veryLongName =
        "María Fernanda de la Concepción Hernández Rodríguez de los Santos Martínez del Campo " +
        "Gutiérrez Villaseñor de la Torre y Mendoza";

      drawWrappedText(ctx, veryLongName, field);

      // drawWrappedText leaves ctx.font set to this field's font, so
      // measureText here reflects the same metrics it used internally.
      const lastCallText = fillTextSpy.mock.calls[fillTextSpy.mock.calls.length - 1]?.[0] as string;
      expect(ctx.measureText(lastCallText).width).toBeLessThanOrEqual(field.maxWidth);
    });

    it("defaults to 1 line when a field omits maxLines", () => {
      const ctx = makeContext();
      const field: ContractTemplateField = { x: 460, y: 664, maxWidth: 300, fontSize: 22 };
      const longAddress =
        "Avenida Insurgentes Sur número 1234, Colonia Del Valle Centro, Ciudad de México";

      const lineCount = drawWrappedText(ctx, longAddress, field);

      expect(lineCount).toBe(1);
    });

    it("does not truncate or add an ellipsis when the text already fits within maxLines", () => {
      const ctx = makeContext();
      const fillTextSpy = vi.spyOn(ctx, "fillText");
      const field: ContractTemplateField = {
        x: 460,
        y: 664,
        maxWidth: 600,
        fontSize: 22,
        maxLines: 2,
      };

      const lineCount = drawWrappedText(ctx, "Av. Reforma 123", field);

      expect(lineCount).toBe(1);
      expect(fillTextSpy).toHaveBeenCalledTimes(1);
      expect(fillTextSpy.mock.calls[0]?.[0]).not.toMatch(/…$/);
    });
  });
});
