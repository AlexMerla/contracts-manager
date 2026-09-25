import { describe, expect, it } from "vitest";

import { nextFolio } from "@/lib/contracts/folio";

// Fake client structurally satisfying `FolioClient` (the interface `nextFolio`
// depends on) — no Prisma/DB involved. Mirrors the real `findFirst` semantics
// this suite needs: filter out folios starting with the legacy prefix, then
// return the lexicographically-highest remaining folio (which, for fixed-width
// zero-padded numerics, is also the numerically-highest).
function fakeClient(folios: string[]) {
  return {
    contract: {
      findFirst: async (args: {
        where: { folio: { not: { startsWith: string } } };
        orderBy: { folio: "desc" };
        select: { folio: true };
      }) => {
        const prefix = args.where.folio.not.startsWith;
        const eligible = folios.filter((folio) => !folio.startsWith(prefix));
        if (eligible.length === 0) {
          return null;
        }
        const [highest] = [...eligible].sort().reverse();
        return { folio: highest };
      },
    },
  };
}

describe("nextFolio", () => {
  it("returns 03000 as the first folio when the table is empty", async () => {
    const folio = await nextFolio(fakeClient([]));
    expect(folio).toBe("03000");
  });

  it("returns 03000 when only legacy CT-#### rows exist", async () => {
    const folio = await nextFolio(
      fakeClient(["CT-0001", "CT-0002", "CT-0003", "CT-0004", "CT-0005"])
    );
    expect(folio).toBe("03000");
  });

  it("ignores CT-TEST-* fixture rows left over from other suites", async () => {
    const folio = await nextFolio(fakeClient(["CT-TEST-0001", "CT-TEST-0002"]));
    expect(folio).toBe("03000");
  });

  it("increments from the highest existing non-legacy folio", async () => {
    const folio = await nextFolio(fakeClient(["CT-0001", "03000", "03001"]));
    expect(folio).toBe("03002");
  });

  it("does not reuse a retired number after a middle row is deleted", async () => {
    // 03000, 03001, 03002 existed; 03001 was deleted. The next folio must
    // still be 03003, not 03001 again — a count-based scheme would re-issue
    // 03001 here, which is exactly the bug this design fixes.
    const folio = await nextFolio(fakeClient(["03000", "03002"]));
    expect(folio).toBe("03003");
  });

  it("rolls over from 09999 to 10000 without losing zero-padding semantics", async () => {
    const folio = await nextFolio(fakeClient(["09999"]));
    expect(folio).toBe("10000");
  });
});
