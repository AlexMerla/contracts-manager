import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Prisma is mocked: the `payments.receipt_*` columns only exist on the shared
// DB once the payment-receipt migration is applied. The renderer is REAL, so
// a valid token returns an actual JPEG of the snapshot.
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { payment: { findUnique } } }));

import { GET } from "@/app/comprobantes/view/[receiptToken]/image/route";
import type { ReceiptSnapshot } from "@/lib/payment-receipt/snapshot";

const TOKEN = "Zk3v9QpX2mN8rT4wY7bC1dF6gH0jK5lA3sE9uI2oP4q";

const snapshot: ReceiptSnapshot = {
  v: 1,
  issuedAt: "2026-11-02T18:30:00.000Z",
  paymentFolio: "PG-0007",
  contractFolio: "03142",
  clientName: "María López García",
  eventType: "wedding",
  eventDate: "2027-02-14",
  amountCents: 500_000,
  method: "cash",
  concept: "deposit",
  paymentDate: "2026-11-01",
  note: null,
  contractTotalCents: 2_000_000,
  totalPaidCents: 500_000,
  balanceCents: 1_500_000,
  paymentStatus: "deposit_paid",
  recordedByName: "Ana Pérez",
};

function get(token: string, query = "") {
  return GET(new Request(`https://example.com/comprobantes/view/${token}/image${query}`), {
    params: Promise.resolve({ receiptToken: token }),
  });
}

async function snapshotOf(response: Response) {
  return {
    status: response.status,
    headers: [...response.headers.entries()],
    body: Buffer.from(await response.arrayBuffer()).toString("hex"),
  };
}

beforeEach(() => {
  findUnique.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /comprobantes/view/[receiptToken]/image", () => {
  it("serves the snapshot as a private, non-indexed JPEG, inline by default", async () => {
    findUnique.mockResolvedValue({ receiptSnapshot: snapshot, contract: { contractStatus: "confirmed" } });
    const response = await get(TOKEN);

    expect(findUnique).toHaveBeenCalledWith({
      where: { receiptToken: TOKEN },
      select: { receiptSnapshot: true, contract: { select: { contractStatus: true } } },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="ComprobantePG-0007.jpg"');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("switches to an attachment with ?descargar=1", async () => {
    findUnique.mockResolvedValue({ receiptSnapshot: snapshot, contract: { contractStatus: "completed" } });
    const response = await get(TOKEN, "?descargar=1");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="ComprobantePG-0007.jpg"');
  });

  // R5: cancelled must be indistinguishable from unknown (and from a payment
  // with no receipt, and from a malformed token that never reaches the DB).
  it("answers a byte-identical 404 for unknown, cancelled, receipt-less and malformed tokens", async () => {
    findUnique.mockResolvedValueOnce(null);
    const unknown = await snapshotOf(await get(TOKEN));

    findUnique.mockResolvedValueOnce({ receiptSnapshot: snapshot, contract: { contractStatus: "cancelled" } });
    const cancelled = await snapshotOf(await get(TOKEN));

    findUnique.mockResolvedValueOnce({ receiptSnapshot: null, contract: { contractStatus: "confirmed" } });
    const noReceipt = await snapshotOf(await get(TOKEN));

    const malformed = await snapshotOf(await get("../../etc"));

    expect(unknown.status).toBe(404);
    expect(cancelled).toEqual(unknown);
    expect(noReceipt).toEqual(unknown);
    expect(malformed).toEqual(unknown);
    expect(findUnique).toHaveBeenCalledTimes(3);
  });
});
