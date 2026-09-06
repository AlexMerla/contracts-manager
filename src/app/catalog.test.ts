import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// These exercise real behavior against the real database (no mocks for
// Prisma/Postgres, matching this project's established testing pattern —
// see src/lib/authorization.test.ts). `auth()` is mocked to return a
// `super` session so the actions' own `requireRole` gate passes; that gate
// itself is already proven independently in catalog-authorization.test.ts.
// `vi.hoisted` so `mockAuth` is created alongside the hoisted `vi.mock`
// call below, rather than after it (a plain `const` here would still throw
// "Cannot access before initialization" since `vi.mock` is hoisted above
// it). This also sidesteps a real type wrinkle: next-auth v5's `auth`
// export is overloaded (plain session getter vs. middleware signature),
// which `vi.mocked()` resolves ambiguously against `mockResolvedValue`.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

// `revalidatePath` throws "static generation store missing" when called
// outside an actual Next.js request/render lifecycle — expected when
// invoking a Server Action directly from a test runner rather than through
// a real request, not a bug in the action itself. Stubbed here since it's a
// framework side-effect, not part of the database behavior under test.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { deleteCategory } from "@/app/categorias/actions";
import { deleteService } from "@/app/servicios/actions";
import { setPriceListDefault } from "@/app/listas-precios/actions";
import {
  deletePackage,
  savePackagePrice,
  setPackageServices,
} from "@/app/paquetes/actions";

const superSession = {
  user: {
    id: randomUUID(),
    role: "super" as const,
    name: "Super",
    email: "super-test@example.com",
  },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

beforeAll(() => {
  mockAuth.mockResolvedValue(superSession);
});

describe("setPriceListDefault", () => {
  const listAId = randomUUID();
  const listBId = randomUUID();

  beforeAll(async () => {
    await prisma.priceList.createMany({
      data: [
        { id: listAId, name: "Throwaway list A", isDefault: true },
        { id: listBId, name: "Throwaway list B", isDefault: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.priceList.deleteMany({ where: { id: { in: [listAId, listBId] } } });
  });

  it("unsets the previous default when a new one is marked default", async () => {
    const result = await setPriceListDefault(listBId);
    expect(result).toEqual({ success: true });

    const [listA, listB] = await Promise.all([
      prisma.priceList.findUniqueOrThrow({ where: { id: listAId } }),
      prisma.priceList.findUniqueOrThrow({ where: { id: listBId } }),
    ]);
    expect(listA.isDefault).toBe(false);
    expect(listB.isDefault).toBe(true);
  });
});

describe("referential-integrity guards on delete (sprint-03 task 7)", () => {
  const categoryId = randomUUID();
  const serviceId = randomUUID();
  const packageId = randomUUID();

  beforeAll(async () => {
    await prisma.category.create({
      data: { id: categoryId, name: "Throwaway category" },
    });
    await prisma.service.create({
      data: { id: serviceId, name: "Throwaway service", categoryId },
    });
    await prisma.package.create({
      data: { id: packageId, name: "Throwaway package", categoryId },
    });
    await prisma.packageService.create({
      data: { packageId, serviceId },
    });
  });

  afterAll(async () => {
    await prisma.packageService.deleteMany({ where: { packageId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.service.deleteMany({ where: { id: serviceId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("blocks deleting a category still referenced by a package and a service", async () => {
    const result = await deleteCategory(categoryId);
    expect(result).toHaveProperty("error");
    if ("error" in result) {
      expect(result.error).toMatch(/paquete/);
      expect(result.error).toMatch(/servicio/);
    }

    const stillExists = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    expect(stillExists).not.toBeNull();
  });

  it("blocks deleting a service still referenced by package_services", async () => {
    const result = await deleteService(serviceId);
    expect(result).toHaveProperty("error");
    if ("error" in result) {
      expect(result.error).toMatch(/paquete/);
    }

    const stillExists = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    expect(stillExists).not.toBeNull();
  });
});

describe("setPackageServices (sprint-03 task 5)", () => {
  const categoryId = randomUUID();
  const packageId = randomUUID();
  const serviceAId = randomUUID();
  const serviceBId = randomUUID();

  beforeAll(async () => {
    await prisma.category.create({
      data: { id: categoryId, name: "Throwaway category 2" },
    });
    await prisma.package.create({
      data: { id: packageId, name: "Throwaway package 2", categoryId },
    });
    await prisma.service.createMany({
      data: [
        { id: serviceAId, name: "Throwaway service A", categoryId },
        { id: serviceBId, name: "Throwaway service B", categoryId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.packageService.deleteMany({ where: { packageId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.service.deleteMany({ where: { id: { in: [serviceAId, serviceBId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("replaces the full association set rather than appending", async () => {
    await setPackageServices(packageId, [serviceAId]);
    let links = await prisma.packageService.findMany({ where: { packageId } });
    expect(links.map((l) => l.serviceId)).toEqual([serviceAId]);

    await setPackageServices(packageId, [serviceBId]);
    links = await prisma.packageService.findMany({ where: { packageId } });
    expect(links.map((l) => l.serviceId)).toEqual([serviceBId]);
  });
});

describe("savePackagePrice (sprint-03 task 6)", () => {
  const categoryId = randomUUID();
  const packageId = randomUUID();
  const listAId = randomUUID();
  const listBId = randomUUID();

  beforeAll(async () => {
    await prisma.category.create({
      data: { id: categoryId, name: "Throwaway category 3" },
    });
    await prisma.package.create({
      data: { id: packageId, name: "Throwaway package 3", categoryId },
    });
    await prisma.priceList.createMany({
      data: [
        { id: listAId, name: "Throwaway list C", isDefault: false },
        { id: listBId, name: "Throwaway list D", isDefault: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.packagePrice.deleteMany({ where: { packageId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.priceList.deleteMany({ where: { id: { in: [listAId, listBId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("a newly-created price list has no price for an existing package until set explicitly", async () => {
    const price = await prisma.packagePrice.findUnique({
      where: { packageId_priceListId: { packageId, priceListId: listBId } },
    });
    expect(price).toBeNull();
  });

  it("setting the price for one list does not affect another list", async () => {
    await savePackagePrice(packageId, listAId, 1500);

    const [priceA, priceB] = await Promise.all([
      prisma.packagePrice.findUnique({
        where: { packageId_priceListId: { packageId, priceListId: listAId } },
      }),
      prisma.packagePrice.findUnique({
        where: { packageId_priceListId: { packageId, priceListId: listBId } },
      }),
    ]);
    expect(Number(priceA?.price)).toBe(1500);
    expect(priceB).toBeNull();
  });

  it("clearing a price (null) deletes the row instead of storing zero", async () => {
    await savePackagePrice(packageId, listAId, null);

    const price = await prisma.packagePrice.findUnique({
      where: { packageId_priceListId: { packageId, priceListId: listAId } },
    });
    expect(price).toBeNull();
  });
});

describe("deletePackage (sprint-03 task 3 / task 7)", () => {
  it("cascades its own package_services and package_prices rows", async () => {
    const categoryId = randomUUID();
    const packageId = randomUUID();
    const serviceId = randomUUID();
    const priceListId = randomUUID();

    await prisma.category.create({
      data: { id: categoryId, name: "Throwaway category 4" },
    });
    await prisma.package.create({
      data: { id: packageId, name: "Throwaway package 4", categoryId },
    });
    await prisma.service.create({
      data: { id: serviceId, name: "Throwaway service C", categoryId },
    });
    await prisma.priceList.create({
      data: { id: priceListId, name: "Throwaway list E", isDefault: false },
    });
    await prisma.packageService.create({ data: { packageId, serviceId } });
    await prisma.packagePrice.create({
      data: { packageId, priceListId, price: 100 },
    });

    const result = await deletePackage(packageId);
    expect(result).toEqual({ success: true });

    const [pkg, links, prices] = await Promise.all([
      prisma.package.findUnique({ where: { id: packageId } }),
      prisma.packageService.findMany({ where: { packageId } }),
      prisma.packagePrice.findMany({ where: { packageId } }),
    ]);
    expect(pkg).toBeNull();
    expect(links).toHaveLength(0);
    expect(prices).toHaveLength(0);

    await prisma.service.deleteMany({ where: { id: serviceId } });
    await prisma.priceList.deleteMany({ where: { id: priceListId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("blocks deleting a package already used by a real contract", async () => {
    const categoryId = randomUUID();
    const packageId = randomUUID();
    const priceListId = randomUUID();
    const userId = randomUUID();
    const contractId = randomUUID();
    const contractPackageId = randomUUID();

    await prisma.category.create({
      data: { id: categoryId, name: "Throwaway category 5" },
    });
    await prisma.package.create({
      data: { id: packageId, name: "Throwaway package 5", categoryId },
    });
    await prisma.priceList.create({
      data: { id: priceListId, name: "Throwaway list F", isDefault: false },
    });
    await prisma.user.create({
      data: {
        id: userId,
        name: "Throwaway user",
        email: `throwaway-${userId}@example.com`,
        passwordHash: "unused-in-this-test",
        role: "normal",
      },
    });
    await prisma.contract.create({
      data: {
        id: contractId,
        folio: `CT-TEST-${contractId.slice(0, 8)}`,
        clientName: "Cliente de prueba",
        eventType: "boda",
        eventDate: new Date("2026-12-01"),
        subtotal: 100,
        total: 100,
        deposit: 20,
        balance: 80,
        viewerToken: randomUUID(),
        priceListId,
        createdById: userId,
      },
    });
    await prisma.contractPackage.create({
      data: {
        id: contractPackageId,
        contractId,
        packageId,
        nameSnapshot: "Throwaway package 5",
        priceSnapshot: 100,
      },
    });

    const result = await deletePackage(packageId);
    expect(result).toHaveProperty("error");
    if ("error" in result) {
      expect(result.error).toMatch(/contrato/);
    }

    const stillExists = await prisma.package.findUnique({ where: { id: packageId } });
    expect(stillExists).not.toBeNull();

    await prisma.contractPackage.deleteMany({ where: { id: contractPackageId } });
    await prisma.contract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.priceList.deleteMany({ where: { id: priceListId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });
});
