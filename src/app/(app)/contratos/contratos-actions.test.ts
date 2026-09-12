import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real database, no mocks for Prisma (this project's established pattern —
// see src/lib/authorization.test.ts, src/app/catalog.test.ts). `auth()` is
// mocked to return a fixed `normal` session so `createContract`'s own
// `requireSession` gate resolves to a real, existing user row (needed
// since `createdById` is a real FK to `users`).
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

// `revalidatePath` throws "static generation store missing" when called
// outside an actual Next.js request/render lifecycle — expected when
// invoking a Server Action directly from a test runner (see
// src/app/catalog.test.ts for the same stub). `regenerateContractImage`
// calls it after flipping `imageGenerated`.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  createContract,
  regenerateContractImage,
  type CreateContractResult,
} from "@/app/(app)/contratos/actions";
import type { CreateContractPayload } from "@/app/(app)/contratos/nuevo/schema";

const ownerUserId = randomUUID();
const otherUserId = randomUUID();
const categoryId = randomUUID();
const priceListId = randomUUID();
const packageWithServiceId = randomUUID();
const packageNoServiceId = randomUUID();
const packageNoPriceId = randomUUID();
const serviceId = randomUUID();

const ownerSession = {
  user: { id: ownerUserId, role: "normal" as const, name: "Owner", email: "owner-test@example.com" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const createdContractIds: string[] = [];

function validContractData() {
  return {
    clientName: "Cliente de prueba",
    clientPhone: "",
    clientMobile: "",
    clientEmail: "",
    clientAddress: "",
    eventType: "boda",
    celebrated: "",
    eventDate: "2027-06-15",
    eventTime: "18:30",
    placeName: "",
    placeAddress: "",
  };
}

function basePayload(): CreateContractPayload {
  return {
    priceListId,
    orderLines: [
      { packageId: packageWithServiceId, quantity: 2 },
      { packageId: packageNoServiceId, quantity: 1 },
    ],
    serviceSelections: [{ serviceId, selectedOption: "Opción A" }],
    contractData: validContractData(),
    discount: null,
    extraCharge: null,
    deposit: 1000,
  };
}

async function cleanupCreatedContracts() {
  if (createdContractIds.length === 0) {
    return;
  }
  await prisma.contractServiceSelection.deleteMany({
    where: { contractId: { in: createdContractIds } },
  });
  await prisma.contractPackage.deleteMany({ where: { contractId: { in: createdContractIds } } });
  await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
  createdContractIds.length = 0;
}

describe("createContract", () => {
  beforeAll(async () => {
    mockAuth.mockResolvedValue(ownerSession);

    await prisma.user.createMany({
      data: [
        {
          id: ownerUserId,
          name: "Throwaway Owner",
          email: "owner-test@example.com",
          passwordHash: "unused-in-this-test",
          role: "normal",
        },
        {
          id: otherUserId,
          name: "Throwaway Other",
          email: "other-test@example.com",
          passwordHash: "unused-in-this-test",
          role: "normal",
        },
      ],
    });

    await prisma.category.create({ data: { id: categoryId, name: "Throwaway category" } });

    await prisma.priceList.create({
      data: { id: priceListId, name: "Throwaway price list", isDefault: false, active: true },
    });

    await prisma.service.create({
      data: { id: serviceId, name: "Servicio con opciones", categoryId, options: ["Opción A", "Opción B"] },
    });

    await prisma.package.createMany({
      data: [
        {
          id: packageWithServiceId,
          name: "Paquete con servicio",
          categoryId,
          maxQuantity: 3,
          quantityUnit: "unidades",
        },
        { id: packageNoServiceId, name: "Paquete simple", categoryId },
        { id: packageNoPriceId, name: "Paquete sin precio", categoryId },
      ],
    });

    await prisma.packageService.create({
      data: { packageId: packageWithServiceId, serviceId },
    });

    await prisma.packagePrice.createMany({
      data: [
        { packageId: packageWithServiceId, priceListId, price: 1000 },
        { packageId: packageNoServiceId, priceListId, price: 500 },
      ],
    });
  });

  afterAll(async () => {
    await cleanupCreatedContracts();
    await prisma.packagePrice.deleteMany({
      where: { packageId: { in: [packageWithServiceId, packageNoServiceId, packageNoPriceId] } },
    });
    await prisma.packageService.deleteMany({ where: { packageId: packageWithServiceId } });
    await prisma.package.deleteMany({
      where: { id: { in: [packageWithServiceId, packageNoServiceId, packageNoPriceId] } },
    });
    await prisma.service.delete({ where: { id: serviceId } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } });
  });

  it("creates the contract, its package snapshots, and its service selections atomically", async () => {
    const result = await createContract(basePayload());
    expect("success" in result && result.success).toBe(true);
    const { contractId, folio } = result as Extract<CreateContractResult, { success: true }>;
    createdContractIds.push(contractId);

    expect(folio).toMatch(/^CT-\d{4,}$/);

    const contract = await prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
      include: { contractPackages: true, contractServiceSelections: true },
    });

    // subtotal = 1000 * 2 (packageWithService) + 500 * 1 (packageNoService)
    expect(Number(contract.subtotal)).toBe(2500);
    expect(Number(contract.total)).toBe(2500);
    expect(Number(contract.deposit)).toBe(1000);
    expect(Number(contract.balance)).toBe(1500);
    expect(contract.createdById).toBe(ownerUserId);
    expect(contract.viewerToken).toBeTruthy();

    expect(contract.contractPackages).toHaveLength(2);
    const snapshotByPackageId = new Map(
      contract.contractPackages.map((line) => [line.packageId, line])
    );
    expect(snapshotByPackageId.get(packageWithServiceId)).toMatchObject({
      nameSnapshot: "Paquete con servicio",
      priceSnapshot: expect.anything(),
      quantity: 2,
    });
    expect(Number(snapshotByPackageId.get(packageWithServiceId)?.priceSnapshot)).toBe(1000);

    expect(contract.contractServiceSelections).toHaveLength(1);
    expect(contract.contractServiceSelections[0]).toMatchObject({
      serviceId,
      selectedOption: "Opción A",
    });

    // eventTime round-trip: stored and read back as the same wall-clock time
    // (src/app/(app)/contratos/actions.ts writes it as a UTC ISO string on a
    // fixed 1970-01-01 date; the detail page reads it back with
    // `timeZone: "UTC"` for the same reason).
    expect(contract.eventTime?.toISOString()).toBe("1970-01-01T18:30:00.000Z");
  });

  it("rejects a quantity above the package's maxQuantity", async () => {
    const payload = basePayload();
    payload.orderLines = [{ packageId: packageWithServiceId, quantity: 4 }];
    payload.serviceSelections = [{ serviceId, selectedOption: "Opción A" }];

    const result = await createContract(payload);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/excede el máximo permitido/);
  });

  it("rejects when a required service selection is missing", async () => {
    const payload = basePayload();
    payload.serviceSelections = [];

    const result = await createContract(payload);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Falta elegir una opción/);
  });

  it("rejects when a package has no price in the selected price list", async () => {
    const payload = basePayload();
    payload.orderLines = [{ packageId: packageNoPriceId, quantity: 1 }];
    payload.serviceSelections = [];

    const result = await createContract(payload);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/no tiene precio en la lista seleccionada/);
  });

  it("ignores a spoofed createdById and attributes the contract to the real session user", async () => {
    // The schema has no `createdById` field at all, so a well-typed caller
    // can't even express this — this simulates a raw request that adds the
    // key anyway (e.g. a handcrafted fetch bypassing the wizard's types).
    const payload = { ...basePayload(), createdById: otherUserId } as unknown as CreateContractPayload;

    const result = await createContract(payload);
    expect("success" in result && result.success).toBe(true);
    const { contractId } = result as Extract<CreateContractResult, { success: true }>;
    createdContractIds.push(contractId);

    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(contract.createdById).toBe(ownerUserId);
    expect(contract.createdById).not.toBe(otherUserId);
  });

  // Sprint 5 task 6: image generation runs as a best-effort step right
  // after the transaction commits — this proves it actually ran and set
  // the status column, not just that it didn't throw.
  it("auto-generates the contract image at confirm time and sets imageGenerated", async () => {
    const result = await createContract(basePayload());
    expect("success" in result && result.success).toBe(true);
    const { contractId } = result as Extract<CreateContractResult, { success: true }>;
    createdContractIds.push(contractId);

    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(contract.imageGenerated).toBe(true);
  });

  // Sprint 5 tasks 6 & 7: the manual retry / on-demand regeneration action.
  // Proves both the §5 ownership scoping (another user's session can't
  // touch this contract, and imageGenerated stays false) and the actual
  // regeneration + flag flip for the owning session.
  it("regenerateContractImage rejects a non-owning session and succeeds for the owner", async () => {
    const result = await createContract(basePayload());
    expect("success" in result && result.success).toBe(true);
    const { contractId } = result as Extract<CreateContractResult, { success: true }>;
    createdContractIds.push(contractId);

    // Simulate the confirm-time generation having failed.
    await prisma.contract.update({ where: { id: contractId }, data: { imageGenerated: false } });

    mockAuth.mockResolvedValueOnce({
      user: {
        id: otherUserId,
        role: "normal" as const,
        name: "Other",
        email: "other-test@example.com",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
    const otherResult = await regenerateContractImage(contractId);
    expect("error" in otherResult).toBe(true);

    const stillFalse = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(stillFalse.imageGenerated).toBe(false);

    const ownerResult = await regenerateContractImage(contractId);
    expect("success" in ownerResult && ownerResult.success).toBe(true);

    const regenerated = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(regenerated.imageGenerated).toBe(true);
  });
});
