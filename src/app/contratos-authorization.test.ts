import { describe, expect, it, vi } from "vitest";

// Spec §5: contract creation is allowed for BOTH roles (unlike the catalog
// CRUD actions, which are super-only) — so the only authorization boundary
// `createContract` needs is "a session must exist at all". Matches the
// pattern in src/app/catalog-authorization.test.ts: `auth()` is mocked to
// return `null`, and the action is called directly, bypassing the UI
// entirely, exactly like an unauthenticated request would.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

import { UnauthorizedError } from "@/lib/authorization";
import { createContract } from "@/app/(app)/contratos/actions";
import type { CreateContractPayload } from "@/app/(app)/contratos/nuevo/schema";

const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

const dummyPayload: CreateContractPayload = {
  priceListId: DUMMY_ID,
  orderLines: [{ packageId: DUMMY_ID, quantity: 1 }],
  serviceSelections: [],
  contractData: {
    clientName: "x",
    clientPhone: "",
    clientMobile: "",
    clientEmail: "",
    clientAddress: "",
    eventType: "x",
    celebrated: "",
    eventDate: "2027-01-01",
    eventTime: "",
    placeName: "",
    placeAddress: "",
  },
  discount: null,
  extraCharge: null,
  deposit: 0,
};

describe("createContract rejects an unauthenticated request", () => {
  it("throws UnauthorizedError before touching the database", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(createContract(dummyPayload)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
