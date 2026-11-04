import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

import {
  formatReceiptDate,
  generateReceiptImage,
  RECEIPT_HEIGHT,
  RECEIPT_WIDTH,
} from "./generate-receipt-image";

import type { ReceiptSnapshot } from "./snapshot";

const snapshot: ReceiptSnapshot = {
  v: 1,
  issuedAt: "2026-11-02T18:30:00.000Z",
  paymentFolio: "PG-0007",
  contractFolio: "03142",
  clientName: "María López García",
  eventType: "quinceanera",
  eventDate: "2027-02-14",
  amountCents: 500_000,
  method: "bank_transfer",
  concept: "installment",
  paymentDate: "2026-11-01",
  note: "Depósito BBVA ref 1234",
  contractTotalCents: 2_000_000,
  totalPaidCents: 1_200_000,
  balanceCents: 800_000,
  paymentStatus: "partial",
  recordedByName: "Ana Pérez",
};

describe("generateReceiptImage", () => {
  it("renders a 1080x1440 JPEG", async () => {
    const image = await generateReceiptImage(snapshot);
    expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const decoded = await loadImage(image);
    expect(decoded.width).toBe(RECEIPT_WIDTH);
    expect(decoded.height).toBe(RECEIPT_HEIGHT);
  });

  // R1: the snapshot is the ONLY input — the email attachment, the viewer and
  // the staff download of one payment are the same file, whenever rendered.
  it("is deterministic for the same snapshot and changes when a printed value does", async () => {
    const first = await generateReceiptImage(snapshot);
    const second = await generateReceiptImage(structuredClone(snapshot));
    expect(second.equals(first)).toBe(true);

    const other = await generateReceiptImage({ ...snapshot, amountCents: 500_100 });
    expect(other.equals(first)).toBe(false);
  });

  it("survives a very long client name and note, and a settled contract with no note", async () => {
    await expect(
      generateReceiptImage({
        ...snapshot,
        clientName: "María de los Ángeles ".repeat(12),
        note: "Referencia muy larga ".repeat(40),
        balanceCents: 0,
        paymentStatus: "paid_in_full",
      })
    ).resolves.toBeInstanceOf(Buffer);
    await expect(generateReceiptImage({ ...snapshot, note: null })).resolves.toBeInstanceOf(Buffer);
  });
});

describe("formatReceiptDate", () => {
  it("prints dd/mm/aaaa without building a Date", () => {
    expect(formatReceiptDate("2027-02-14")).toBe("14/02/2027");
  });
});
