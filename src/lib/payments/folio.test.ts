import { describe, expect, it } from "vitest";

import { nextPaymentFolio } from "@/lib/payments/folio";

// Fake client structurally satisfying `PaymentFolioClient` — no database.
// Mirrors the real query: the lexicographically-highest folio, or null.
function fakeClient(folios: string[]) {
  return {
    payment: {
      findFirst: async () => {
        const [highest] = [...folios].sort().reverse();
        return highest === undefined ? null : { folio: highest };
      },
    },
  };
}

describe("nextPaymentFolio", () => {
  it("starts at PG-0001 when there are no payments", async () => {
    expect(await nextPaymentFolio(fakeClient([]))).toBe("PG-0001");
  });

  it("is exactly the highest existing folio + 1", async () => {
    expect(await nextPaymentFolio(fakeClient(["PG-0001", "PG-0002", "PG-0003"]))).toBe("PG-0004");
  });

  it("does not reuse a retired number after a middle row is deleted", async () => {
    expect(await nextPaymentFolio(fakeClient(["PG-0001", "PG-0003"]))).toBe("PG-0004");
  });

  it("is one global sequence, whatever contract the existing payments belong to", async () => {
    // The query has no contract filter: the fake mirrors that by taking
    // every folio, so payments of other contracts still push the sequence.
    expect(await nextPaymentFolio(fakeClient(["PG-0010", "PG-0002"]))).toBe("PG-0011");
  });
});
