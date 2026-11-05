import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real database, no mocks for Prisma (this project's established pattern —
// see src/app/(app)/contratos/contratos-actions.test.ts). Three modules ARE
// mocked, per the design's own testing strategy table:
//
//  * `@/lib/contracts/house-user` — decouples this suite from whether
//    `npm run db:seed` has run against this dev DB; the mock returns a
//    throwaway user row this file creates itself, so the FK stays real.
//  * `@/lib/turnstile` — no real network call, no real Cloudflare keys.
//  * `@/lib/contracts/delivery-pipeline` — MANDATORY: `vitest.config.mts`
//    loads the real `.env`, so an unmocked run would hit the live
//    Drive/Calendar/Resend/HighLevel, exactly as contratos-actions.test.ts
//    documents for the internal path.
const { mockGetHouseUserId } = vi.hoisted(() => ({ mockGetHouseUserId: vi.fn() }));
vi.mock("@/lib/contracts/house-user", () => ({
  getHouseUserId: mockGetHouseUserId,
}));

const { mockVerifyTurnstileToken } = vi.hoisted(() => ({ mockVerifyTurnstileToken: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: mockVerifyTurnstileToken,
}));

const { mockRunPipeline } = vi.hoisted(() => ({ mockRunPipeline: vi.fn() }));
vi.mock("@/lib/contracts/delivery-pipeline", () => ({
  runContractDeliveryPipeline: mockRunPipeline,
}));

// `getPublicPriceList` is ALSO mocked, on top of the design's own minimum —
// not for isolation from an external system, but because "exactly one
// public price list" is a GLOBAL, shared-dev-DB invariant
// (src/app/(app)/listas-precios/actions.ts's `setPriceListPublic` sweep
// clears every other `isPublic: true` row). That suite's own tests
// legitimately flip the flag on throwaway fixtures of their own, and vitest
// runs test FILES in parallel — so a real `isPublic: true` row in THIS file
// could be cleared mid-run by that unrelated file. Mocking the resolution
// keeps this suite deterministic without weakening what it actually tests:
// the action's own gate ordering and catalog/validation logic, not
// `getPublicPriceList`'s query (which has its own focused coverage via
// `setPriceListPublic`'s tests).
const { mockGetPublicPriceList } = vi.hoisted(() => ({ mockGetPublicPriceList: vi.fn() }));
vi.mock("@/lib/contracts/public-price-list", () => ({
  getPublicPriceList: mockGetPublicPriceList,
}));

// `headers()` throws "headers was called outside a request scope" when a
// Server Action is invoked directly from a test runner — same class of
// problem `revalidatePath` has in the other actions test files.
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { prisma } from "@/lib/prisma";
import { scopeToOwner } from "@/lib/authorization";
import { calculateDefaultDeposit } from "@/lib/deposit";
import { getDepositThresholds } from "@/lib/deposit-config";

import { createPublicPreContract, type CreatePublicPreContractResult } from "./actions";
import type { CreatePublicPreContractPayload } from "./schema";

const houseUserId = randomUUID();
const otherRealUserId = randomUUID();
const categoryId = randomUUID();
const publicPriceListId = randomUUID();
const otherPriceListId = randomUUID();
const packageWithServiceId = randomUUID();
const packageNoServiceId = randomUUID();
const packageInactiveId = randomUUID();
const packageNoPriceId = randomUUID();
const serviceId = randomUUID();

const createdContractIds: string[] = [];

function validContractData() {
  return {
    clientName: "Cliente público de prueba",
    clientPhone: "",
    clientMobile: "5555555555",
    clientEmail: "cliente-publico@example.com",
    clientAddress: "",
    eventType: "wedding" as const,
    celebrated: "",
    eventDate: "2027-08-20",
    eventTime: "17:00",
    placeName: "",
    placeAddress: "",
  };
}

function basePayload(): CreatePublicPreContractPayload {
  return {
    orderLines: [
      { packageId: packageWithServiceId, quantity: 2 },
      { packageId: packageNoServiceId, quantity: 1 },
    ],
    serviceSelections: [{ serviceId, selectedOption: "Opción A" }],
    contractData: validContractData(),
    turnstileToken: "test-token",
  };
}

// "No folio consumed" == "no contract row inserted" (folios derive from the
// highest existing row). Counted per this suite's own house user rather than
// via a global `nextFolio` before/after, which other test files creating
// contracts in parallel workers would race against.
function countHouseUserContracts() {
  return prisma.contract.count({ where: { createdById: houseUserId } });
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

describe("createPublicPreContract", () => {
  const originalEnabled = process.env.PUBLIC_PRECONTRACT_ENABLED;

  beforeAll(async () => {
    mockGetHouseUserId.mockResolvedValue(houseUserId);

    await prisma.user.createMany({
      data: [
        {
          id: houseUserId,
          name: "Cliente (web) — throwaway",
          email: "cliente-web-test@precontrato.invalid",
          passwordHash: "unused-in-this-test",
          role: "normal",
          active: false,
        },
        {
          id: otherRealUserId,
          name: "Throwaway Other",
          email: "other-public-precontract-test@example.com",
          passwordHash: "unused-in-this-test",
          role: "normal",
        },
      ],
    });

    await prisma.category.create({ data: { id: categoryId, name: "Throwaway category (public)" } });

    // `otherPriceListId` is a SECOND, non-public list priced CHEAPER than the
    // public one — this is the spoofing target of the "hostile payload" test:
    // if the action ever accepted a client-supplied `priceListId`, pricing
    // the order against this list would under-charge the client.
    await prisma.priceList.createMany({
      data: [
        { id: publicPriceListId, name: "Lista pública (test)", isPublic: true, active: true },
        { id: otherPriceListId, name: "Lista más barata (test, NO pública)", isPublic: false, active: true },
      ],
    });

    await prisma.service.create({
      data: { id: serviceId, name: "Servicio con opciones (public)", categoryId, options: ["Opción A", "Opción B"] },
    });

    await prisma.package.createMany({
      data: [
        { id: packageWithServiceId, name: "Paquete con servicio (public)", categoryId, maxQuantity: 3, quantityUnit: "unidades" },
        { id: packageNoServiceId, name: "Paquete simple (public)", categoryId },
        { id: packageInactiveId, name: "Paquete inactivo (public)", categoryId, active: false },
        { id: packageNoPriceId, name: "Paquete sin precio (public)", categoryId },
      ],
    });

    await prisma.packageService.create({ data: { packageId: packageWithServiceId, serviceId } });

    // Prices are deliberately well above this environment's real deposit
    // thresholds (`getDepositThresholds()` — read from the actual .env, not
    // hard-coded here) so the default order's total comfortably exceeds the
    // computed deposit; a fixture priced too low would spuriously trip the
    // "deposit exceeds total" refusal this suite tests SEPARATELY and
    // deliberately, in its own dedicated test.
    await prisma.packagePrice.createMany({
      data: [
        { packageId: packageWithServiceId, priceListId: publicPriceListId, price: 2000 },
        { packageId: packageNoServiceId, priceListId: publicPriceListId, price: 1000 },
        { packageId: packageInactiveId, priceListId: publicPriceListId, price: 100 },
        // Deliberately priced far lower on the OTHER list — the hostile
        // payload test asserts this price is never the one actually used.
        { packageId: packageWithServiceId, priceListId: otherPriceListId, price: 1 },
      ],
    });
  });

  beforeEach(() => {
    process.env.PUBLIC_PRECONTRACT_ENABLED = "true";
    mockVerifyTurnstileToken.mockReset().mockResolvedValue({ ok: true });
    mockRunPipeline.mockReset().mockResolvedValue(undefined);
    mockGetHouseUserId.mockResolvedValue(houseUserId);
    mockGetPublicPriceList
      .mockReset()
      .mockResolvedValue({ id: publicPriceListId, name: "Lista pública (test)" });
  });

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.PUBLIC_PRECONTRACT_ENABLED;
    } else {
      process.env.PUBLIC_PRECONTRACT_ENABLED = originalEnabled;
    }
  });

  afterAll(async () => {
    await cleanupCreatedContracts();
    await prisma.packagePrice.deleteMany({
      where: { packageId: { in: [packageWithServiceId, packageNoServiceId, packageInactiveId, packageNoPriceId] } },
    });
    await prisma.packageService.deleteMany({ where: { packageId: packageWithServiceId } });
    await prisma.package.deleteMany({
      where: { id: { in: [packageWithServiceId, packageNoServiceId, packageInactiveId, packageNoPriceId] } },
    });
    await prisma.service.delete({ where: { id: serviceId } });
    await prisma.priceList.deleteMany({ where: { id: { in: [publicPriceListId, otherPriceListId] } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [houseUserId, otherRealUserId] } } });
  });

  it("creates the pre-contract with server-computed amounts, ignoring every client-supplied trust-hole field", async () => {
    const thresholds = getDepositThresholds();
    const hostilePayload = {
      ...basePayload(),
      // None of these fields exist on `createPublicPreContractSchema` — zod
      // strips them at parse time. Cast through `unknown` to simulate a
      // handcrafted request bypassing the wizard's own types, same spirit as
      // contratos-actions.test.ts's spoofed-createdById test.
      deposit: 0,
      discount: 999999,
      extraCharge: -1,
      priceListId: otherPriceListId,
      createdById: otherRealUserId,
    } as unknown as CreatePublicPreContractPayload;

    const result = await createPublicPreContract(hostilePayload);
    expect("success" in result && result.success).toBe(true);
    const { viewerToken, folio } = result as Extract<CreatePublicPreContractResult, { success: true }>;

    const contract = await prisma.contract.findUniqueOrThrow({
      where: { viewerToken },
      include: { contractPackages: true },
    });
    createdContractIds.push(contract.id);

    expect(contract.folio).toBe(folio);
    // subtotal = 2000 * 2 + 1000 * 1, priced off the PUBLIC list only.
    expect(Number(contract.subtotal)).toBe(5000);
    expect(Number(contract.total)).toBe(5000);
    expect(contract.discount).toBeNull();
    expect(contract.extraCharge).toBeNull();
    expect(Number(contract.deposit)).toBe(calculateDefaultDeposit(5000, thresholds));
    expect(contract.priceListId).toBe(publicPriceListId);
    expect(contract.priceListId).not.toBe(otherPriceListId);
    expect(contract.createdById).toBe(houseUserId);
    expect(contract.createdById).not.toBe(otherRealUserId);

    // Spec §6.5 — snapshot, never a live join.
    const snapshot = contract.contractPackages.find((p) => p.packageId === packageWithServiceId);
    expect(snapshot).toMatchObject({ nameSnapshot: "Paquete con servicio (public)", quantity: 2 });
    expect(Number(snapshot?.priceSnapshot)).toBe(2000);

    expect(mockRunPipeline).toHaveBeenCalledWith({ contractId: contract.id });
  });

  it("rejects before any write when the computed deposit exceeds the total — no folio consumed, pipeline never called", async () => {
    const thresholds = getDepositThresholds();
    const cheapPackageId = randomUUID();
    await prisma.package.create({ data: { id: cheapPackageId, name: "Paquete barato (public)", categoryId } });
    await prisma.packagePrice.create({ data: { packageId: cheapPackageId, priceListId: publicPriceListId, price: 1 } });

    // Sanity-check the fixture actually exercises the edge case on THIS
    // environment's real deposit thresholds before asserting on it.
    expect(calculateDefaultDeposit(1, thresholds)).toBeGreaterThan(1);

    const contractsBefore = await countHouseUserContracts();

    const payload: CreatePublicPreContractPayload = {
      orderLines: [{ packageId: cheapPackageId, quantity: 1 }],
      serviceSelections: [],
      contractData: validContractData(),
      turnstileToken: "test-token",
    };
    const result = await createPublicPreContract(payload);

    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/anticipo mayor al total/);
    expect(mockRunPipeline).not.toHaveBeenCalled();

    expect(await countHouseUserContracts()).toBe(contractsBefore);

    await prisma.packagePrice.deleteMany({ where: { packageId: cheapPackageId } });
    await prisma.package.delete({ where: { id: cheapPackageId } });
  });

  it("rejects when the public kill switch is disabled, before even checking Turnstile", async () => {
    process.env.PUBLIC_PRECONTRACT_ENABLED = "false";

    const result = await createPublicPreContract(basePayload());

    expect("error" in result).toBe(true);
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("rejects when Turnstile fails, consuming no folio", async () => {
    mockVerifyTurnstileToken.mockResolvedValue({ ok: false, message: "No pudimos verificar que sea una persona." });

    const contractsBefore = await countHouseUserContracts();
    const result = await createPublicPreContract(basePayload());

    expect(result).toEqual({ error: "No pudimos verificar que sea una persona." });
    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(await countHouseUserContracts()).toBe(contractsBefore);
  });

  it("rejects when no price list is marked public", async () => {
    mockGetPublicPriceList.mockResolvedValue(null);

    const result = await createPublicPreContract(basePayload());

    expect("error" in result).toBe(true);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("rejects a payload with duplicate packages", async () => {
    const payload = basePayload();
    payload.orderLines = [
      { packageId: packageNoServiceId, quantity: 1 },
      { packageId: packageNoServiceId, quantity: 1 },
    ];
    payload.serviceSelections = [];

    const result = await createPublicPreContract(payload);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/repetidos/);
  });

  it("rejects an inactive package with the same generic message as a missing one", async () => {
    const payload = basePayload();
    payload.orderLines = [{ packageId: packageInactiveId, quantity: 1 }];
    payload.serviceSelections = [];

    const result = await createPublicPreContract(payload);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/ya no está disponible/);
  });

  it("rejects a package with no price in the public list", async () => {
    const payload = basePayload();
    payload.orderLines = [{ packageId: packageNoPriceId, quantity: 1 }];
    payload.serviceSelections = [];

    const result = await createPublicPreContract(payload);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/ya no está disponible/);
  });

  it("rejects a quantity above the package's maxQuantity", async () => {
    const payload = basePayload();
    payload.orderLines = [{ packageId: packageWithServiceId, quantity: 4 }];

    const result = await createPublicPreContract(payload);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/excede el máximo permitido/);
  });

  it("rejects when a required service selection is missing", async () => {
    const payload = basePayload();
    payload.serviceSelections = [];

    const result = await createPublicPreContract(payload);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Falta elegir una opción/);
  });

  // edit-precontract — characterization BEFORE the pricing loop moves to
  // `@/lib/contracts/price-order`: exact (deliberately generic) copy.
  it("characterization: exact rejection copy for every pricing/validation failure", async () => {
    async function errorFor(patch: Partial<CreatePublicPreContractPayload>): Promise<string | undefined> {
      const result = await createPublicPreContract({ ...basePayload(), ...patch });
      return "error" in result ? result.error : undefined;
    }
    const unavailable = "Alguno de los paquetes de su pedido ya no está disponible.";

    expect(
      await errorFor({
        orderLines: [
          { packageId: packageNoServiceId, quantity: 1 },
          { packageId: packageNoServiceId, quantity: 1 },
        ],
        serviceSelections: [],
      })
    ).toBe("Su pedido tiene paquetes repetidos.");
    expect(
      await errorFor({ orderLines: [{ packageId: randomUUID(), quantity: 1 }], serviceSelections: [] })
    ).toBe(unavailable);
    expect(
      await errorFor({ orderLines: [{ packageId: packageInactiveId, quantity: 1 }], serviceSelections: [] })
    ).toBe(unavailable);
    expect(
      await errorFor({ orderLines: [{ packageId: packageNoPriceId, quantity: 1 }], serviceSelections: [] })
    ).toBe(unavailable);
    expect(await errorFor({ orderLines: [{ packageId: packageWithServiceId, quantity: 4 }] })).toBe(
      'La cantidad de "Paquete con servicio (public)" excede el máximo permitido (3).'
    );
    expect(await errorFor({ serviceSelections: [{ serviceId, selectedOption: "Opción Z" }] })).toBe(
      'Falta elegir una opción para el servicio "Servicio con opciones (public)".'
    );
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("a house-user-owned pre-contract is invisible to a normal session and visible to super (spec §5)", async () => {
    const result = await createPublicPreContract(basePayload());
    expect("success" in result && result.success).toBe(true);
    const { viewerToken } = result as Extract<CreatePublicPreContractResult, { success: true }>;
    const contract = await prisma.contract.findUniqueOrThrow({ where: { viewerToken } });
    createdContractIds.push(contract.id);

    const normalSession = {
      user: { id: otherRealUserId, role: "normal" as const, name: "Other", email: "other@example.com" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };
    const superSession = {
      user: { id: otherRealUserId, role: "super" as const, name: "Super", email: "super@example.com" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };

    const foundByNormal = await scopeToOwner(normalSession).contract.findUnique({
      where: { id: contract.id },
    });
    expect(foundByNormal).toBeNull();

    const foundBySuper = await scopeToOwner(superSession).contract.findUnique({
      where: { id: contract.id },
    });
    expect(foundBySuper?.id).toBe(contract.id);
  });
});
