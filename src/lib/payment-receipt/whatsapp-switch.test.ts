import { describe, expect, it } from "vitest";

import { RECEIPT_WHATSAPP_ENABLED } from "./whatsapp-switch";

describe("RECEIPT_WHATSAPP_ENABLED", () => {
  // Guards the product pause (2026-11-03): flipping it is a deliberate act.
  it("ships paused", () => {
    expect(RECEIPT_WHATSAPP_ENABLED).toBe(false);
  });
});
