import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { scopeToOwner } from "@/lib/authorization";

// Proves spec §5's data-access-layer requirement against the real database
// (no mocking, matching this project's convention): a `normal` session must
// never see another user's contracts, even when the caller passes no
// explicit `where` at all — the whole point of scopeToOwner is that a route
// author can "forget" the filter and still be safe.
describe("scopeToOwner", () => {
  const priceListId = randomUUID();
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  const contractOwnedByAId = randomUUID();
  const contractOwnedByBId = randomUUID();

  beforeAll(async () => {
    await prisma.priceList.create({
      data: { id: priceListId, name: "Throwaway test price list" },
    });

    await prisma.user.createMany({
      data: [
        {
          id: ownerAId,
          name: "Throwaway Owner A",
          email: "throwaway-owner-a@example.com",
          passwordHash: "unused-in-this-test",
          role: "normal",
        },
        {
          id: ownerBId,
          name: "Throwaway Owner B",
          email: "throwaway-owner-b@example.com",
          passwordHash: "unused-in-this-test",
          role: "normal",
        },
      ],
    });

    const baseContract = {
      eventType: "boda",
      eventDate: new Date("2026-12-01"),
      subtotal: 1000,
      total: 1000,
      deposit: 200,
      balance: 800,
      priceListId,
    };

    await prisma.contract.create({
      data: {
        ...baseContract,
        id: contractOwnedByAId,
        folio: "CT-TEST-A",
        clientName: "Cliente A",
        viewerToken: randomUUID(),
        createdById: ownerAId,
      },
    });

    await prisma.contract.create({
      data: {
        ...baseContract,
        id: contractOwnedByBId,
        folio: "CT-TEST-B",
        clientName: "Cliente B",
        viewerToken: randomUUID(),
        createdById: ownerBId,
      },
    });
  });

  afterAll(async () => {
    await prisma.contract.deleteMany({
      where: { id: { in: [contractOwnedByAId, contractOwnedByBId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerAId, ownerBId] } } });
    await prisma.priceList.delete({ where: { id: priceListId } });
  });

  function sessionFor(userId: string, role: "super" | "normal") {
    return {
      user: { id: userId, role, name: "Test User", email: "test@example.com" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  it("findUnique cannot return another user's contract, with no explicit filter", async () => {
    const db = scopeToOwner(sessionFor(ownerAId, "normal"));

    const result = await db.contract.findUnique({
      where: { id: contractOwnedByBId },
    });

    expect(result).toBeNull();
  });

  it("findMany with an empty where only returns the caller's own contracts", async () => {
    const db = scopeToOwner(sessionFor(ownerAId, "normal"));

    const results = await db.contract.findMany({});

    expect(results.map((contract) => contract.id)).toEqual([contractOwnedByAId]);
  });

  it("a super session is not scoped at all", async () => {
    const db = scopeToOwner(sessionFor(ownerAId, "super"));

    const result = await db.contract.findUnique({
      where: { id: contractOwnedByBId },
    });

    expect(result?.id).toBe(contractOwnedByBId);
  });
});
