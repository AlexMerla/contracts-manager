import { describe, expect, it } from "vitest";

import { buildDriveMultipartBody } from "@/lib/google/drive";

// Only the pure multipart framing is covered here — the upload itself needs a
// live Drive (see the design's testing notes).
describe("buildDriveMultipartBody", () => {
  const content = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // JPEG SOI + APP0

  it("frames metadata and binary content into a multipart/related body", () => {
    const body = buildDriveMultipartBody({
      boundary: "BOUND",
      metadata: { name: "A-0042 - María López.jpg", mimeType: "image/jpeg", parents: ["folder-1"] },
      contentType: "image/jpeg",
      content,
    });

    // latin1 keeps one char per byte, so the JPEG bytes can't corrupt the
    // framing assertions; the metadata part is asserted as UTF-8 separately
    // below, since that's what `charset=UTF-8` promises Drive.
    const framing = body.toString("latin1");
    expect(
      framing.startsWith("--BOUND\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n")
    ).toBe(true);
    expect(framing).toContain("--BOUND\r\nContent-Type: image/jpeg\r\n\r\n");
    expect(framing.endsWith("\r\n--BOUND--\r\n")).toBe(true);

    const metadataJson = body
      .subarray(
        framing.indexOf("\r\n\r\n") + 4,
        framing.indexOf("\r\n--BOUND\r\nContent-Type: image/jpeg")
      )
      .toString("utf8");
    expect(JSON.parse(metadataJson)).toEqual({
      name: "A-0042 - María López.jpg",
      mimeType: "image/jpeg",
      parents: ["folder-1"],
    });
  });

  it("preserves the image bytes verbatim between the headers and the closing boundary", () => {
    const body = buildDriveMultipartBody({
      boundary: "BOUND",
      metadata: {},
      contentType: "image/jpeg",
      content,
    });

    const marker = Buffer.from("Content-Type: image/jpeg\r\n\r\n", "utf8");
    const start = body.indexOf(marker) + marker.length;
    expect(body.subarray(start, start + content.length).equals(content)).toBe(true);
  });
});
