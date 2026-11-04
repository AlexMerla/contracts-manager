import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit test of the staff download route. `scopeToOwner` itself (the §5
// data-layer scoping) is covered against the real DB by
// src/lib/authorization.test.ts and, for this exact query, by
// payment-receipt-actions.test.ts once the migration is applied; here it is
// replaced by a stub so the route's own contract is checked: session gate,
// id validation, the scoped query's shape, and "cancelled is still
// downloadable".
const mocks = vi.hoisted(() => ({ auth: vi.fn(), scopeToOwner: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/authorization", () => ({ scopeToOwner: mocks.scopeToOwner }));

import { GET } from "@/app/(app)/contratos/[id]/pagos/[paymentId]/comprobante/route";
import type { ReceiptSnapshot } from "@/lib/payment-receipt/snapshot";

const CONTRACT_ID = "0f8b3c1e-9a52-4d7e-8c11-2b6f4e9a7d30";
const PAYMENT_ID = "6a1d2e3f-4b5c-4d6e-8f70-91a2b3c4d5e6";
const session = { user: { id: "u-1", role: "normal", name: "Ana", email: "ana@example.com" }, expires: "" };

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

function get(id: string, paymentId: string) {
  return GET(new Request(`https://example.com/contratos/${id}/pagos/${paymentId}/comprobante`), {
    params: Promise.resolve({ id, paymentId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(session);
  mocks.scopeToOwner.mockReturnValue({ payment: { findFirst: mocks.findFirst } });
});

describe("GET /contratos/[id]/pagos/[paymentId]/comprobante", () => {
  it("downloads the receipt as an attachment through the owner-scoped client", async () => {
    mocks.findFirst.mockResolvedValue({ receiptSnapshot: snapshot });
    const response = await get(CONTRACT_ID, PAYMENT_ID);

    expect(mocks.scopeToOwner).toHaveBeenCalledWith(session);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: PAYMENT_ID, contractId: CONTRACT_ID },
      select: { receiptSnapshot: true },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="ComprobantePG-0007.jpg"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  // Decision: staff keep the internal record of a cancelled contract. The
  // route never reads contract status, so the scoped query above is the
  // whole gate — the same query answers for a cancelled contract.
  it("does not look at contract status (cancelled contracts stay downloadable)", async () => {
    mocks.findFirst.mockResolvedValue({ receiptSnapshot: snapshot });
    await get(CONTRACT_ID, PAYMENT_ID);
    const [args] = mocks.findFirst.mock.calls[0] ?? [];
    expect(JSON.stringify(args)).not.toContain("contractStatus");
  });

  it("answers 404 when the scoped query finds nothing (another user's payment, or none)", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const response = await get(CONTRACT_ID, PAYMENT_ID);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("No se encontró el comprobante.");
  });

  it("answers the same 404 for a payment that predates receipts and for malformed ids", async () => {
    mocks.findFirst.mockResolvedValue({ receiptSnapshot: null });
    expect((await get(CONTRACT_ID, PAYMENT_ID)).status).toBe(404);
    expect((await get("nope", PAYMENT_ID)).status).toBe(404);
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects an anonymous request without querying", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await get(CONTRACT_ID, PAYMENT_ID);
    expect(response.status).toBe(401);
    expect(mocks.scopeToOwner).not.toHaveBeenCalled();
  });
});
