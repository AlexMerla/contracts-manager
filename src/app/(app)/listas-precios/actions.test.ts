import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real database, no mocks for Prisma (this project's established pattern —
// see src/app/(app)/contratos/contratos-actions.test.ts). `auth()` is mocked
// to a fixed `super` session because `duplicatePriceList` gates on
// `requireRole(session, "super")`.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

// `revalidatePath` throws "static generation store missing" outside a real
// Next.js request lifecycle — expected when calling a Server Action straight
// from the test runner.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { duplicatePriceList, setPriceListPublic } from "@/app/(app)/listas-precios/actions";

const superUserId = randomUUID();
const categoryId = randomUUID();
const sourceListId = randomUUID();
const packageAId = randomUUID();
const packageBId = randomUUID();

const superSession = {
  user: {
    id: superUserId,
    role: "super" as const,
    name: "Throwaway Super",
    email: "super-pricelist-test@example.com",
  },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const createdListIds: string[] = [];

describe("duplicatePriceList", () => {
  beforeAll(async () => {
    mockAuth.mockResolvedValue(superSession);

    await prisma.user.create({
      data: {
        id: superUserId,
        name: "Throwaway Super",
        email: "super-pricelist-test@example.com",
        passwordHash: "unused-in-this-test",
        role: "super",
      },
    });

    await prisma.category.create({
      data: { id: categoryId, name: "Throwaway category (price list test)" },
    });

    await prisma.package.createMany({
      data: [
        { id: packageAId, name: "Paquete A (dup test)", categoryId },
        { id: packageBId, name: "Paquete B (dup test)", categoryId },
      ],
    });

    // NOTE: `isDefault` is deliberately NOT set here. `src/app/catalog.test.ts`
    // exercises `setPriceListDefault`, whose `updateMany({ where: { isDefault:
    // true, NOT: { id } } })` is a GLOBAL write against the same shared dev
    // database — with vitest's default file parallelism it clears the flag on
    // any fixture this file owns. The flag is set inside the one test that
    // needs it, immediately before the call.
    await prisma.priceList.create({
      data: {
        id: sourceListId,
        name: "Lista origen (dup test)",
        isDefault: false,
        active: true,
      },
    });

    await prisma.packagePrice.createMany({
      data: [
        { packageId: packageAId, priceListId: sourceListId, price: 1234.56 },
        { packageId: packageBId, priceListId: sourceListId, price: 700 },
      ],
    });
  });

  afterAll(async () => {
    const allListIds = [sourceListId, ...createdListIds];
    await prisma.packagePrice.deleteMany({
      where: { priceListId: { in: allListIds } },
    });
    await prisma.priceList.deleteMany({ where: { id: { in: allListIds } } });
    await prisma.package.deleteMany({
      where: { id: { in: [packageAId, packageBId] } },
    });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: superUserId } });
  });

  it("copies every package price and never copies the isDefault flag", async () => {
    // Set the flag as late as possible so a parallel test file's global
    // `setPriceListDefault` sweep has the smallest possible window to clear it.
    await prisma.priceList.update({
      where: { id: sourceListId },
      data: { isDefault: true },
    });

    const result = await duplicatePriceList(sourceListId);
    expect("success" in result).toBe(true);
    const { id: copyId } = result as Extract<typeof result, { success: true }>;
    createdListIds.push(copyId);

    const copy = await prisma.priceList.findUniqueOrThrow({
      where: { id: copyId },
      include: { packagePrices: true },
    });

    expect(copy.name).toBe("Lista origen (dup test) (copia)");
    // The real invariant (spec §6.9): the copy is hard-coded to false, so this
    // holds whatever the source's flag was at read time.
    expect(copy.isDefault).toBe(false);
    expect(copy.active).toBe(true);

    expect(copy.packagePrices).toHaveLength(2);
    const priceByPackageId = new Map(
      copy.packagePrices.map((pp) => [pp.packageId, Number(pp.price)])
    );
    expect(priceByPackageId.get(packageAId)).toBe(1234.56);
    expect(priceByPackageId.get(packageBId)).toBe(700);

    // The source's own prices are untouched — duplicating is never a move.
    // (`isDefault` is NOT asserted here: it is globally mutable from other
    // test files, see the fixture note above.)
    const source = await prisma.priceList.findUniqueOrThrow({
      where: { id: sourceListId },
      include: { packagePrices: true },
    });
    expect(source.packagePrices).toHaveLength(2);
  });

  it("resolves a name collision with a numbered suffix", async () => {
    const result = await duplicatePriceList(sourceListId);
    expect("success" in result).toBe(true);
    const { id: copyId } = result as Extract<typeof result, { success: true }>;
    createdListIds.push(copyId);

    const copy = await prisma.priceList.findUniqueOrThrow({ where: { id: copyId } });
    expect(copy.name).toBe("Lista origen (dup test) (copia 2)");
  });

  it("returns a typed error for a price list that no longer exists", async () => {
    const result = await duplicatePriceList(randomUUID());
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/ya no existe/);
  });

  it("rejects a `normal` session before touching the database", async () => {
    const listsBefore = await prisma.priceList.count();

    mockAuth.mockResolvedValueOnce({
      user: {
        id: superUserId,
        role: "normal" as const,
        name: "Throwaway Super",
        email: "super-pricelist-test@example.com",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(duplicatePriceList(sourceListId)).rejects.toThrow();
    expect(await prisma.priceList.count()).toBe(listsBefore);
  });
});

// public-precontract Q6 — own fixtures, deliberately NOT sharing
// `sourceListId` with the `duplicatePriceList` suite above: toggling
// `isPublic` globally (same "exactly one" sweep shape as `isDefault`) would
// otherwise race the same way the fixture note above describes for
// `isDefault`.
describe("setPriceListPublic", () => {
  const activeListId = randomUUID();
  const otherActiveListId = randomUUID();
  const inactiveListId = randomUUID();

  beforeAll(async () => {
    mockAuth.mockResolvedValue(superSession);

    await prisma.priceList.createMany({
      data: [
        { id: activeListId, name: "Lista activa (public test)", active: true },
        { id: otherActiveListId, name: "Lista activa 2 (public test)", active: true },
        { id: inactiveListId, name: "Lista inactiva (public test)", active: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.priceList.deleteMany({
      where: { id: { in: [activeListId, otherActiveListId, inactiveListId] } },
    });
  });

  it("refuses to publish an inactive price list", async () => {
    const result = await setPriceListPublic(inactiveListId, true);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/desactivada/);

    const list = await prisma.priceList.findUniqueOrThrow({ where: { id: inactiveListId } });
    expect(list.isPublic).toBe(false);
  });

  it("publishing one active list clears any previously-public list (exactly one, or zero)", async () => {
    const first = await setPriceListPublic(activeListId, true);
    expect("success" in first).toBe(true);

    const second = await setPriceListPublic(otherActiveListId, true);
    expect("success" in second).toBe(true);

    const [a, b] = await Promise.all([
      prisma.priceList.findUniqueOrThrow({ where: { id: activeListId } }),
      prisma.priceList.findUniqueOrThrow({ where: { id: otherActiveListId } }),
    ]);
    expect(a.isPublic).toBe(false);
    expect(b.isPublic).toBe(true);
  });

  it("un-publishing leaves zero public lists — a legitimate state, unlike isDefault", async () => {
    await setPriceListPublic(otherActiveListId, true);
    const result = await setPriceListPublic(otherActiveListId, false);
    expect("success" in result).toBe(true);

    const list = await prisma.priceList.findUniqueOrThrow({ where: { id: otherActiveListId } });
    expect(list.isPublic).toBe(false);
  });

  it("deactivating a public list also clears isPublic", async () => {
    await setPriceListPublic(activeListId, true);

    const { setPriceListActive } = await import("@/app/(app)/listas-precios/actions");
    await setPriceListActive(activeListId, false);

    const list = await prisma.priceList.findUniqueOrThrow({ where: { id: activeListId } });
    expect(list.active).toBe(false);
    expect(list.isPublic).toBe(false);

    // Restore for test isolation within this describe block.
    await prisma.priceList.update({ where: { id: activeListId }, data: { active: true } });
  });
});
