import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// edit-precontract — `updateContract` against the real dev DB (this
// project's no-Prisma-mocks pattern). Mocked: `auth()` (session), Next's
// `revalidatePath` (no request scope in vitest), and the post-commit edit
// pipeline — MANDATORY, since `.env` is loaded and an unmocked run would
// overwrite real Drive files and real Calendar events.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRunEditPipeline, mockRunDeliveryPipeline } = vi.hoisted(() => ({
  mockRunEditPipeline: vi.fn(),
  mockRunDeliveryPipeline: vi.fn(),
}));
vi.mock("@/lib/contracts/delivery-pipeline", () => ({
  runContractEditPipeline: mockRunEditPipeline,
  runContractDeliveryPipeline: mockRunDeliveryPipeline,
}));

import { prisma } from "@/lib/prisma";
import { updateContract } from "@/app/(app)/contratos/[id]/actions";
import type { UpdateContractPayload } from "@/app/(app)/contratos/nuevo/schema";
import type { ContractStatus, PaymentStatus } from "@/generated/prisma/client";

const ownerUserId = randomUUID();
const otherUserId = randomUUID();
const superUserId = randomUUID();
const categoryId = randomUUID();
const priceListId = randomUUID();
const serviceId = randomUUID();
const pkgWithService = randomUUID(); // live 3500, snapshot 3000 on fixtures, max 3
const pkgSimple = randomUUID(); // live 1200, the "new line" package
const pkgInactive = randomUUID(); // inactive, priced — refused as a NEW line
const pkgKeptInactive = randomUUID(); // inactive, unpriced — fine as a KEPT line, max 2
const allPackageIds = [pkgWithService, pkgSimple, pkgInactive, pkgKeptInactive];

function sessionFor(id: string, role: "normal" | "super", name: string) {
  return {
    user: { id, role, name, email: `${id}@example.com` },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}
const ownerSession = sessionFor(ownerUserId, "normal", "Dueña");
const otherSession = sessionFor(otherUserId, "normal", "Otro");
const superSession = sessionFor(superUserId, "super", "Admin");

const createdContractIds: string[] = [];

interface FixtureLine {
  packageId: string;
  name: string;
  price: number;
  quantity: number;
}

const WITH_SERVICE_LINE: FixtureLine = {
  packageId: pkgWithService,
  name: "Paquete con servicio (snapshot)",
  price: 3000,
  quantity: 1,
};

async function createEditableContract(options: {
  lines?: FixtureLine[];
  deposit?: number;
  payments?: number[];
  contractStatus?: ContractStatus;
  paymentStatus?: PaymentStatus;
  createdById?: string;
}) {
  const lines = options.lines ?? [WITH_SERVICE_LINE];
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const deposit = options.deposit ?? 1000;
  const contract = await prisma.contract.create({
    data: {
      // `CT-TEST-` — the prefix `nextFolio` skips; anything else risks "00NaN".
      folio: `CT-TEST-${randomUUID().slice(0, 8)}`,
      clientName: "Cliente edición",
      clientPhone: "5551112222",
      clientMobile: "5553334444",
      clientEmail: "edicion@example.com",
      eventType: "wedding",
      eventDate: new Date("2027-06-15T00:00:00.000Z"),
      eventTime: new Date("1970-01-01T18:30:00.000Z"),
      subtotal,
      total: subtotal,
      deposit,
      balance: subtotal - deposit,
      viewerToken: randomUUID(),
      priceListId,
      createdById: options.createdById ?? ownerUserId,
      contractStatus: options.contractStatus ?? "pre_contract",
      paymentStatus: options.paymentStatus ?? "pending",
      imageGenerated: true,
      driveUploaded: true,
      calendarCreated: true,
      driveFileId: "drive-c",
      preContractDriveFileId: "drive-p",
      contractPackages: {
        create: lines.map((line) => ({
          packageId: line.packageId,
          nameSnapshot: line.name,
          priceSnapshot: line.price,
          quantity: line.quantity,
        })),
      },
      contractServiceSelections: lines.some((line) => line.packageId === pkgWithService)
        ? { create: [{ serviceId, selectedOption: "Rojo" }] }
        : undefined,
    },
  });
  createdContractIds.push(contract.id);

  for (const [index, amount] of (options.payments ?? []).entries()) {
    await prisma.payment.create({
      data: {
        contractId: contract.id,
        // Sorts BELOW every `PG-####` (digit < letter), so `nextPaymentFolio`'s
        // `ORDER BY folio DESC` can never pick it up and compute `NaN`.
        folio: `0TEST-${randomUUID().slice(0, 8)}-${index}`,
        amount,
        method: "cash",
        concept: "deposit",
        paymentDate: new Date("2026-10-01T00:00:00.000Z"),
        recordedById: ownerUserId,
      },
    });
  }
  return contract;
}

/** The identical payload — what the wizard sends when nothing was touched. */
function unchangedPayload(contractId: string, lines: FixtureLine[] = [WITH_SERVICE_LINE]): UpdateContractPayload {
  return {
    contractId,
    orderLines: lines.map((line) => ({ packageId: line.packageId, quantity: line.quantity })),
    serviceSelections: lines.some((line) => line.packageId === pkgWithService)
      ? [{ serviceId, selectedOption: "Rojo" }]
      : [],
    contractData: {
      clientName: "Cliente edición",
      clientPhone: "5551112222",
      clientMobile: "5553334444",
      clientEmail: "edicion@example.com",
      clientAddress: "",
      eventType: "wedding",
      celebrated: "",
      eventDate: "2027-06-15",
      eventTime: "18:30",
      placeName: "",
      placeAddress: "",
    },
    discount: null,
    extraCharge: null,
    deposit: 1000,
  };
}

function errorOf(result: Awaited<ReturnType<typeof updateContract>>): string | undefined {
  return "error" in result ? result.error : undefined;
}

async function notesOf(contractId: string) {
  return prisma.note.findMany({ where: { contractId } });
}

// Several tests build 2-3 fixture contracts (plus payments) against the
// shared remote dev DB; the default 5 s per test is too tight for that.
describe("updateContract", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: ownerUserId, name: "Throwaway edit owner", email: `${ownerUserId}@example.com`, passwordHash: "x", role: "normal" },
        { id: otherUserId, name: "Throwaway edit other", email: `${otherUserId}@example.com`, passwordHash: "x", role: "normal" },
        { id: superUserId, name: "Throwaway edit super", email: `${superUserId}@example.com`, passwordHash: "x", role: "super" },
      ],
    });
    await prisma.category.create({ data: { id: categoryId, name: "Throwaway category (edit)" } });
    await prisma.priceList.create({ data: { id: priceListId, name: "Throwaway list (edit)" } });
    await prisma.service.create({
      data: { id: serviceId, name: "Color", categoryId, options: ["Rojo", "Azul"] },
    });
    await prisma.package.createMany({
      data: [
        { id: pkgWithService, name: "Paquete con servicio (live)", categoryId, maxQuantity: 3 },
        { id: pkgSimple, name: "Paquete simple", categoryId },
        { id: pkgInactive, name: "Paquete archivado", categoryId, active: false },
        { id: pkgKeptInactive, name: "Paquete viejo", categoryId, active: false, maxQuantity: 2 },
      ],
    });
    await prisma.packageService.create({ data: { packageId: pkgWithService, serviceId } });
    await prisma.packagePrice.createMany({
      data: [
        { packageId: pkgWithService, priceListId, price: 3500 },
        { packageId: pkgSimple, priceListId, price: 1200 },
        { packageId: pkgInactive, priceListId, price: 100 },
      ],
    });
  });

  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue(ownerSession);
    mockRunEditPipeline.mockReset().mockResolvedValue(undefined);
    mockRunDeliveryPipeline.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.note.deleteMany({ where: { contractId: { in: createdContractIds } } });
    await prisma.payment.deleteMany({ where: { contractId: { in: createdContractIds } } });
    await prisma.contractServiceSelection.deleteMany({ where: { contractId: { in: createdContractIds } } });
    await prisma.contractPackage.deleteMany({ where: { contractId: { in: createdContractIds } } });
    await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
    await prisma.packagePrice.deleteMany({ where: { packageId: { in: allPackageIds } } });
    await prisma.packageService.deleteMany({ where: { packageId: pkgWithService } });
    await prisma.package.deleteMany({ where: { id: { in: allPackageIds } } });
    await prisma.service.delete({ where: { id: serviceId } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId, superUserId] } } });
  });

  it("keeps kept snapshots, prices new lines from the contract's list, recomputes, notes, resets flags (S1.1, S7.1, S7.2)", async () => {
    const contract = await createEditableContract({});
    const payload = unchangedPayload(contract.id);
    payload.orderLines = [
      { packageId: pkgWithService, quantity: 2 }, // quantity-only change: snapshot 3000 stays
      { packageId: pkgSimple, quantity: 1 }, // new line: live 1200
    ];
    payload.contractData.clientPhone = "5550000000";

    expect(await updateContract(payload)).toEqual({ success: true, changed: true });

    const after = await prisma.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: { contractPackages: true },
    });
    const byPackage = new Map(after.contractPackages.map((line) => [line.packageId, line]));
    expect(Number(byPackage.get(pkgWithService)?.priceSnapshot)).toBe(3000);
    expect(byPackage.get(pkgWithService)?.nameSnapshot).toBe("Paquete con servicio (snapshot)");
    expect(byPackage.get(pkgWithService)?.quantity).toBe(2);
    expect(Number(byPackage.get(pkgSimple)?.priceSnapshot)).toBe(1200);
    expect(Number(after.subtotal)).toBe(7200);
    expect(Number(after.total)).toBe(7200);
    expect(Number(after.balance)).toBe(6200);
    expect(after.clientPhone).toBe("5550000000");
    expect(after).toMatchObject({
      imageGenerated: false,
      driveUploaded: false,
      calendarCreated: false,
      driveFileId: "drive-c",
      preContractDriveFileId: "drive-p",
      contractStatus: "pre_contract",
      paymentStatus: "pending",
    });

    const notes = await notesOf(contract.id);
    expect(notes.map((note) => note.text)).toEqual([
      "Contrato editado por Dueña: teléfono, paquetes, cantidades",
    ]);
    expect(notes[0]?.userId).toBe(ownerUserId);
    expect(mockRunEditPipeline).toHaveBeenCalledWith(contract.id);
    expect(mockRunDeliveryPipeline).not.toHaveBeenCalled();
  });

  it("writes nothing and runs nothing for an identical payload (S11.2)", async () => {
    const contract = await createEditableContract({});

    expect(await updateContract(unchangedPayload(contract.id))).toEqual({ success: true, changed: false });

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after.updatedAt.getTime()).toBe(contract.updatedAt.getTime());
    expect(after.driveUploaded).toBe(true);
    expect(await notesOf(contract.id)).toHaveLength(0);
    expect(mockRunEditPipeline).not.toHaveBeenCalled();
  });

  it("refuses paid-in-full and closed contracts inside the lock, writing nothing (S1.3, S1.4)", async () => {
    const paid = await createEditableContract({ paymentStatus: "paid_in_full", contractStatus: "confirmed" });
    const cancelled = await createEditableContract({ contractStatus: "cancelled" });
    const completed = await createEditableContract({ contractStatus: "completed", paymentStatus: "partial" });

    const edit = (id: string) => {
      const payload = unchangedPayload(id);
      payload.contractData.clientPhone = "5559999999";
      return updateContract(payload);
    };

    expect(errorOf(await edit(paid.id))).toBe("Este contrato ya está liquidado y no se puede editar.");
    expect(errorOf(await edit(cancelled.id))).toBe("Este contrato está cerrado y no se puede editar.");
    expect(errorOf(await edit(completed.id))).toBe("Este contrato está cerrado y no se puede editar.");
    for (const contract of [paid, cancelled, completed]) {
      const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      expect(after.clientPhone).toBe("5551112222");
      expect(await notesOf(contract.id)).toHaveLength(0);
    }
    expect(mockRunEditPipeline).not.toHaveBeenCalled();
  });

  it("scopes by owner: another normal user gets not-found; super may edit any contract (S2.1, S2.2)", async () => {
    const contract = await createEditableContract({});
    const payload = unchangedPayload(contract.id);
    payload.contractData.clientName = "Cliente renombrado";

    mockAuth.mockResolvedValue(otherSession);
    expect(errorOf(await updateContract(payload))).toBe("Contrato no encontrado.");
    expect(await notesOf(contract.id)).toHaveLength(0);

    mockAuth.mockResolvedValue(superSession);
    expect(await updateContract(payload)).toEqual({ success: true, changed: true });
    expect((await notesOf(contract.id)).map((note) => note.text)).toEqual([
      "Contrato editado por Admin: nombre del cliente",
    ]);
  });

  it("ignores a supplied priceListId / folio / createdById (S3.1)", async () => {
    const contract = await createEditableContract({});
    const hostile = {
      ...unchangedPayload(contract.id),
      priceListId: randomUUID(),
      folio: "CT-TEST-HACKED",
      createdById: otherUserId,
      viewerToken: "hijacked",
    } as unknown as UpdateContractPayload;
    hostile.contractData.celebrated = "Ana y Luis";

    expect(await updateContract(hostile)).toEqual({ success: true, changed: true });
    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after).toMatchObject({
      priceListId,
      folio: contract.folio,
      createdById: ownerUserId,
      viewerToken: contract.viewerToken,
      celebrated: "Ana y Luis",
    });
  });

  it("enforces the total floor: below paid refused, equal to paid settles (S4.1, S4.2, S6.5)", async () => {
    const contract = await createEditableContract({
      lines: [{ ...WITH_SERVICE_LINE, quantity: 2 }],
      payments: [5000],
      contractStatus: "confirmed",
      paymentStatus: "partial",
    });
    const payload = unchangedPayload(contract.id, [{ ...WITH_SERVICE_LINE, quantity: 2 }]);

    payload.discount = 2000; // 6000 - 2000 = 4000 < 5000 paid
    expect(errorOf(await updateContract(payload))).toBe(
      "El nuevo total ($4,000.00) no puede ser menor a lo ya cobrado ($5,000.00)."
    );

    payload.discount = 1000; // 5000 == paid
    expect(await updateContract(payload)).toEqual({ success: true, changed: true });
    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after).toMatchObject({ paymentStatus: "paid_in_full", contractStatus: "confirmed" });
    expect(Number(after.total)).toBe(5000);
  });

  it("locks the deposit once collected, and caps a pending deposit at the total (S5.1, S5.2, S5.3)", async () => {
    const collected = await createEditableContract({
      payments: [1000],
      contractStatus: "confirmed",
      paymentStatus: "deposit_paid",
    });
    const lockedPayload = unchangedPayload(collected.id);
    lockedPayload.deposit = 500;
    expect(errorOf(await updateContract(lockedPayload))).toBe(
      "El anticipo ya fue cobrado y no se puede modificar."
    );

    const pending = await createEditableContract({});
    const pendingPayload = unchangedPayload(pending.id);
    pendingPayload.deposit = 3500; // total is 3000
    expect(errorOf(await updateContract(pendingPayload))).toBe("El anticipo no puede ser mayor al total.");

    pendingPayload.deposit = 1500;
    expect(await updateContract(pendingPayload)).toEqual({ success: true, changed: true });
    const after = await prisma.contract.findUniqueOrThrow({ where: { id: pending.id } });
    expect(Number(after.deposit)).toBe(1500);
    expect(Number(after.balance)).toBe(1500);
    expect((await notesOf(pending.id)).map((note) => note.text)).toEqual([
      "Contrato editado por Dueña: anticipo",
    ]);
  });

  it("never regresses status: deposit_paid stays on a raised total; pending→deposit_paid confirms (S6.1, S6.3, S6.4)", async () => {
    const depositPaid = await createEditableContract({
      payments: [1000],
      contractStatus: "confirmed",
      paymentStatus: "deposit_paid",
    });
    const raise = unchangedPayload(depositPaid.id);
    raise.extraCharge = 2000;
    expect(await updateContract(raise)).toEqual({ success: true, changed: true });
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: depositPaid.id } })).toMatchObject({
      paymentStatus: "deposit_paid",
      contractStatus: "confirmed",
    });

    const pending = await createEditableContract({ deposit: 1500, payments: [1000] });
    const lower = unchangedPayload(pending.id);
    lower.deposit = 1000;
    expect(await updateContract(lower)).toEqual({ success: true, changed: true });
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      paymentStatus: "deposit_paid",
      contractStatus: "confirmed",
    });
  });

  it("refuses a NEW inactive package and an emptied order (S7.3, S7.5)", async () => {
    const contract = await createEditableContract({});
    const payload = unchangedPayload(contract.id);
    payload.orderLines = [...payload.orderLines, { packageId: pkgInactive, quantity: 1 }];
    expect(errorOf(await updateContract(payload))).toBe(
      "El paquete «Paquete archivado» no está disponible en la lista de precios de este contrato."
    );

    payload.orderLines = [];
    expect(errorOf(await updateContract(payload))).toBe("El contrato debe incluir al menos un paquete.");
    expect(await notesOf(contract.id)).toHaveLength(0);
  });

  it("removes a package together with its selections (S7.4)", async () => {
    const lines = [WITH_SERVICE_LINE, { packageId: pkgSimple, name: "Paquete simple", price: 1000, quantity: 1 }];
    const contract = await createEditableContract({ lines });
    const payload = unchangedPayload(contract.id, lines);
    payload.orderLines = [{ packageId: pkgSimple, quantity: 1 }];
    payload.serviceSelections = [];

    expect(await updateContract(payload)).toEqual({ success: true, changed: true });
    const after = await prisma.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: { contractPackages: true, contractServiceSelections: true },
    });
    expect(after.contractPackages.map((line) => line.packageId)).toEqual([pkgSimple]);
    expect(Number(after.contractPackages[0]?.priceSnapshot)).toBe(1000); // kept snapshot, not live 1200
    expect(after.contractServiceSelections).toHaveLength(0);
    expect((await notesOf(contract.id)).map((note) => note.text)).toEqual([
      "Contrato editado por Dueña: paquetes, opciones de servicio",
    ]);
  });

  it("keeps an inactive, unpriced kept line; applies live maxQuantity only when its quantity changes (S8.1, S8.2)", async () => {
    const kept: FixtureLine = { packageId: pkgKeptInactive, name: "Paquete viejo", price: 800, quantity: 3 };
    // Quantity 3 is above today's max of 2 — grandfathered while untouched.
    const contract = await createEditableContract({ lines: [kept], deposit: 500 });
    const payload = unchangedPayload(contract.id, [kept]);
    payload.deposit = 500;
    payload.contractData.placeName = "Salón Jardín";

    expect(await updateContract(payload)).toEqual({ success: true, changed: true });
    const after = await prisma.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: { contractPackages: true },
    });
    expect(after.contractPackages).toMatchObject([{ packageId: pkgKeptInactive, quantity: 3 }]);
    expect(Number(after.contractPackages[0]?.priceSnapshot)).toBe(800);

    payload.orderLines = [{ packageId: pkgKeptInactive, quantity: 4 }];
    expect(errorOf(await updateContract(payload))).toBe("«Paquete viejo» permite máximo 2 por contrato.");
  });

  it("re-validates service selections against live options (S9.1)", async () => {
    const contract = await createEditableContract({});
    const payload = unchangedPayload(contract.id);
    payload.serviceSelections = [{ serviceId, selectedOption: "Verde" }];

    expect(errorOf(await updateContract(payload))).toBe(
      "Falta elegir una opción para «Color» en «Paquete con servicio (snapshot)»."
    );

    payload.serviceSelections = [{ serviceId, selectedOption: "Azul" }];
    expect(await updateContract(payload)).toEqual({ success: true, changed: true });
    const selections = await prisma.contractServiceSelection.findMany({ where: { contractId: contract.id } });
    expect(selections.map((selection) => selection.selectedOption)).toEqual(["Azul"]);
  });
});
