import { describe, expect, it } from "vitest";

import {
  buildReceiptSnapshot,
  parseReceiptSnapshot,
  receiptFileName,
  type BuildReceiptSnapshotInput,
} from "./snapshot";

const input: BuildReceiptSnapshotInput = {
  issuedAt: new Date("2026-11-02T18:30:00.000Z"),
  paymentFolio: "PG-0007",
  contractFolio: "03142",
  clientName: "María López García",
  eventType: "quinceanera",
  eventDate: new Date("2027-02-14T00:00:00.000Z"),
  amount: 5000,
  method: "bank_transfer",
  concept: "installment",
  paymentDate: new Date("2026-11-01T00:00:00.000Z"),
  note: "  Depósito BBVA  ",
  contractTotalCents: 2_000_000,
  totalPaidCents: 1_200_000,
  paymentStatus: "partial",
  recordedByName: "Ana Pérez",
};

describe("buildReceiptSnapshot", () => {
  it("freezes every printed value, money in integer cents and dates as UTC calendar days", () => {
    expect(buildReceiptSnapshot(input)).toEqual({
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
      note: "Depósito BBVA",
      contractTotalCents: 2_000_000,
      totalPaidCents: 1_200_000,
      balanceCents: 800_000,
      paymentStatus: "partial",
      recordedByName: "Ana Pérez",
    });
  });

  it("rounds a float amount to the cent instead of drifting (0.1 + 0.2)", () => {
    expect(buildReceiptSnapshot({ ...input, amount: 0.1 + 0.2 }).amountCents).toBe(30);
  });

  it("clamps the balance at zero on an overpayment", () => {
    const snapshot = buildReceiptSnapshot({ ...input, totalPaidCents: 2_500_000, paymentStatus: "paid_in_full" });
    expect(snapshot.balanceCents).toBe(0);
  });

  it("stores a blank note as null and a missing recorder name as an em dash", () => {
    const snapshot = buildReceiptSnapshot({ ...input, note: "   ", recordedByName: null });
    expect(snapshot.note).toBeNull();
    expect(snapshot.recordedByName).toBe("—");
  });

  it("refuses to build a snapshot that would not validate (non-positive amount)", () => {
    expect(() => buildReceiptSnapshot({ ...input, amount: 0 })).toThrow();
  });
});

describe("parseReceiptSnapshot", () => {
  it("round-trips through JSON (what jsonb hands back)", () => {
    const snapshot = buildReceiptSnapshot(input);
    expect(parseReceiptSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("returns null for a payment that predates receipts", () => {
    expect(parseReceiptSnapshot(null)).toBeNull();
    expect(parseReceiptSnapshot(undefined)).toBeNull();
  });

  it("returns null for an unknown version or a corrupted value instead of rendering it", () => {
    const snapshot = buildReceiptSnapshot(input);
    expect(parseReceiptSnapshot({ ...snapshot, v: 2 })).toBeNull();
    expect(parseReceiptSnapshot({ ...snapshot, method: "cheque" })).toBeNull();
    expect(parseReceiptSnapshot({ ...snapshot, amountCents: 12.5 })).toBeNull();
  });
});

describe("receiptFileName", () => {
  it("follows the <Label><folio>.jpg convention", () => {
    expect(receiptFileName("PG-0007")).toBe("ComprobantePG-0007.jpg");
  });
});
