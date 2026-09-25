import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

// Sprint 6 task 8 — `createContract` now chains a real Drive upload and a
// real Calendar event after image generation. Left unmocked, every run of
// this suite would upload a throwaway JPEG into the operator's real Master
// Drive and put a fake XV on the business's real calendar, using the live
// refresh token in `google_connection`. These stubs are what keep the suite
// side-effect-free; they also let it assert the §4.2 contract that a failing
// delivery step never fails contract creation.
const { mockUploadToDrive, mockUpsertCalendarEvent } = vi.hoisted(() => ({
  mockUploadToDrive: vi.fn(),
  mockUpsertCalendarEvent: vi.fn(),
}));
vi.mock("@/lib/google/drive", () => ({
  uploadContractImageToDrive: mockUploadToDrive,
}));
vi.mock("@/lib/google/calendar", () => ({
  upsertContractCalendarEvent: mockUpsertCalendarEvent,
}));

import { prisma } from "@/lib/prisma";
import {
  createContract,
  regenerateContractImage,
  retryCalendarEvent,
  retryDriveUpload,
  type CreateContractResult,
} from "@/app/(app)/contratos/actions";
import type {
  ContractDataFormValues,
  CreateContractPayload,
} from "@/app/(app)/contratos/nuevo/schema";

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

function validContractData(): ContractDataFormValues {
  return {
    clientName: "Cliente de prueba",
    clientPhone: "",
    clientMobile: "5555555555",
    clientEmail: "cliente@example.com",
    clientAddress: "",
    eventType: "wedding",
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
  beforeEach(() => {
    mockUploadToDrive.mockReset().mockResolvedValue({ ok: true });
    mockUpsertCalendarEvent.mockReset().mockResolvedValue({ ok: true });
  });

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

    expect(folio).toMatch(/^\d{5,}$/);
    expect(Number(folio)).toBeGreaterThanOrEqual(3000);

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

  // ---------------------------------------------------------------------
  // Sprint 6 task 8 — Drive + Calendar wiring and per-step retry.
  // ---------------------------------------------------------------------

  it("runs Drive then Calendar after image generation, passing the generated buffer to Drive", async () => {
    const result = await createContract(basePayload());
    const { contractId } = result as Extract<CreateContractResult, { success: true }>;
    createdContractIds.push(contractId);

    expect(mockUploadToDrive).toHaveBeenCalledTimes(1);
    expect(mockUpsertCalendarEvent).toHaveBeenCalledTimes(1);
    const [driveContractId, driveImages] = mockUploadToDrive.mock.calls[0];
    expect(driveContractId).toBe(contractId);
    expect(Buffer.isBuffer(driveImages?.contract)).toBe(true);
    expect(Buffer.isBuffer(driveImages?.preContract)).toBe(true);
    expect(driveImages?.contract.equals(driveImages.preContract)).toBe(false);
    expect(mockUpsertCalendarEvent).toHaveBeenCalledWith(contractId);
  });

  // Spec §4.2 step 4 + task 8: a failure in one step must block neither the
  // other step nor the contract itself.
  it("still creates the contract and still attempts Calendar when Drive fails", async () => {
    mockUploadToDrive.mockResolvedValue({ ok: false, message: "Drive caído" });

    const result = await createContract(basePayload());
    expect("success" in result && result.success).toBe(true);
    const { contractId } = result as Extract<CreateContractResult, { success: true }>;
    createdContractIds.push(contractId);

    expect(mockUpsertCalendarEvent).toHaveBeenCalledWith(contractId);
  });

  it("still creates the contract when both delivery steps throw", async () => {
    mockUploadToDrive.mockRejectedValue(new Error("boom"));
    mockUpsertCalendarEvent.mockRejectedValue(new Error("boom"));

    const result = await createContract(basePayload());
    expect("success" in result && result.success).toBe(true);
    createdContractIds.push(
      (result as Extract<CreateContractResult, { success: true }>).contractId
    );
  });

  it("retryDriveUpload re-runs only Drive, and rejects a non-owning session", async () => {
    const result = await createContract(basePayload());
    const { contractId } = result as Extract<CreateContractResult, { success: true }>;
    createdContractIds.push(contractId);
    mockUploadToDrive.mockClear();
    mockUpsertCalendarEvent.mockClear();

    mockAuth.mockResolvedValueOnce({
      user: {
        id: otherUserId,
        role: "normal" as const,
        name: "Other",
        email: "other-test@example.com",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
    expect("error" in (await retryDriveUpload(contractId))).toBe(true);
    expect(mockUploadToDrive).not.toHaveBeenCalled();

    const ownerResult = await retryDriveUpload(contractId);
    expect("success" in ownerResult && ownerResult.success).toBe(true);
    expect(mockUploadToDrive).toHaveBeenCalledWith(contractId);
    // The point of independent retries: Calendar was not touched.
    expect(mockUpsertCalendarEvent).not.toHaveBeenCalled();
  });

  it("retryCalendarEvent re-runs only Calendar and surfaces the step's own message", async () => {
    const result = await createContract(basePayload());
    const { contractId } = result as Extract<CreateContractResult, { success: true }>;
    createdContractIds.push(contractId);
    mockUploadToDrive.mockClear();
    mockUpsertCalendarEvent.mockClear().mockResolvedValue({ ok: false, message: "Calendar caído" });

    expect(await retryCalendarEvent(contractId)).toEqual({ error: "Calendar caído" });
    expect(mockUploadToDrive).not.toHaveBeenCalled();

    mockUpsertCalendarEvent.mockResolvedValue({ ok: true });
    expect(await retryCalendarEvent(contractId)).toEqual({ success: true });
  });
});
