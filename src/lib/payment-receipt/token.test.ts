import { describe, expect, it } from "vitest";

import { generateReceiptToken } from "./token";

describe("generateReceiptToken", () => {
  it("is 256 bits as 43 URL-safe base64url characters", () => {
    const token = generateReceiptToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateReceiptToken()));
    expect(tokens.size).toBe(1000);
  });
});
