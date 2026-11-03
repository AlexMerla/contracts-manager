import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// edit-precontract (spec R12/R13) — `uploadContractImageToDrive`'s per-file
// create-or-overwrite logic. Google itself is stubbed at the transport seam
// (`googleApiFetch`), so no real Drive is ever touched; the contract row is
// real (this project's no-Prisma-mocks pattern).
const { mockGoogleApiFetch } = vi.hoisted(() => ({ mockGoogleApiFetch: vi.fn() }));
vi.mock("@/lib/google/api-client", () => ({
  googleApiFetch: mockGoogleApiFetch,
}));

import { prisma } from "@/lib/prisma";
import { uploadContractImageToDrive } from "@/lib/google/drive";

const userId = randomUUID();
const priceListId = randomUUID();
const createdContractIds: string[] = [];
const images = { contract: Buffer.from("contract-bytes"), preContract: Buffer.from("pre-bytes") };

async function createContractRow(data: {
  driveUploaded: boolean;
  driveFileId: string | null;
  preContractDriveFileId: string | null;
}) {
  const contract = await prisma.contract.create({
    data: {
      // `CT-TEST-` — the prefix `nextFolio` skips (see payments-actions.test.ts).
      folio: `CT-TEST-${randomUUID().slice(0, 8)}`,
      clientName: "Cliente Drive sync",
      eventType: "wedding",
      eventDate: new Date("2027-05-01T00:00:00.000Z"),
      subtotal: 1000,
      total: 1000,
      deposit: 100,
      balance: 900,
      viewerToken: randomUUID(),
      priceListId,
      createdById: userId,
      ...data,
    },
  });
  createdContractIds.push(contract.id);
  return contract;
}

function calls(): { url: string; method: string }[] {
  return mockGoogleApiFetch.mock.calls.map(([request]) => ({
    url: (request as { url: string }).url,
    method: (request as { method?: string }).method ?? "GET",
  }));
}

describe("uploadContractImageToDrive — create or overwrite in place", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        name: "Throwaway Drive sync",
        email: `drive-sync-${userId}@example.com`,
        passwordHash: "unused-in-this-test",
        role: "normal",
      },
    });
    await prisma.priceList.create({ data: { id: priceListId, name: "Throwaway (drive sync)" } });
  });

  beforeEach(() => {
    vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "folder-1");
    mockGoogleApiFetch.mockReset();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
    await prisma.priceList.delete({ where: { id: priceListId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("is a no-op with no API call when the flag is set and both ids exist (S13.2)", async () => {
    const contract = await createContractRow({
      driveUploaded: true,
      driveFileId: "file-c",
      preContractDriveFileId: "file-p",
    });

    expect(await uploadContractImageToDrive(contract.id, images)).toEqual({ ok: true });
    expect(mockGoogleApiFetch).not.toHaveBeenCalled();
  });

  it("overwrites both existing files with a media PATCH on the SAME ids after an edit (S12.1, S13.1)", async () => {
    const contract = await createContractRow({
      driveUploaded: false,
      driveFileId: "file-c",
      preContractDriveFileId: "file-p",
    });
    mockGoogleApiFetch.mockImplementation(async (request: { url: string }) => ({
      ok: true,
      data: { id: request.url.includes("file-c") ? "file-c" : "file-p" },
    }));

    expect(await uploadContractImageToDrive(contract.id, images)).toEqual({ ok: true });

    expect(calls()).toEqual([
      { url: "https://www.googleapis.com/upload/drive/v3/files/file-c?uploadType=media&fields=id", method: "PATCH" },
      { url: "https://www.googleapis.com/upload/drive/v3/files/file-p?uploadType=media&fields=id", method: "PATCH" },
    ]);
    const firstBody = mockGoogleApiFetch.mock.calls[0]?.[0] as { body: Uint8Array };
    expect(Buffer.from(firstBody.body).equals(images.contract)).toBe(true);

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after).toMatchObject({ driveUploaded: true, driveFileId: "file-c", preContractDriveFileId: "file-p" });
  });

  it("re-creates a file that returns 404 and stores its new id (S12.2)", async () => {
    const contract = await createContractRow({
      driveUploaded: false,
      driveFileId: "gone",
      preContractDriveFileId: "file-p",
    });
    mockGoogleApiFetch.mockImplementation(async (request: { url: string; method?: string }) => {
      if (request.url.includes("/files/gone")) {
        return { ok: false, reason: "request_failed", status: 404, message: "No se pudo (HTTP 404)" };
      }
      if (request.method === "POST") {
        return { ok: true, data: { id: "new-c" } };
      }
      return { ok: true, data: { id: "file-p" } };
    });

    expect(await uploadContractImageToDrive(contract.id, images)).toEqual({ ok: true });

    expect(calls().map((call) => call.method)).toEqual(["PATCH", "POST", "PATCH"]);
    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after).toMatchObject({ driveUploaded: true, driveFileId: "new-c", preContractDriveFileId: "file-p" });
  });

  it("keeps the ids and leaves the flag false when an overwrite fails for another reason (S12.3)", async () => {
    const contract = await createContractRow({
      driveUploaded: false,
      driveFileId: "file-c",
      preContractDriveFileId: "file-p",
    });
    mockGoogleApiFetch.mockResolvedValue({
      ok: false,
      reason: "request_failed",
      status: 500,
      message: "No se pudo actualizar el contrato en Drive (HTTP 500): boom",
    });

    const result = await uploadContractImageToDrive(contract.id, images);
    expect(result).toEqual({ ok: false, message: "No se pudo actualizar el contrato en Drive (HTTP 500): boom" });
    expect(calls().map((call) => call.method)).toEqual(["PATCH"]);

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after).toMatchObject({ driveUploaded: false, driveFileId: "file-c", preContractDriveFileId: "file-p" });
  });

  it("creates both files for a never-uploaded contract (creation path unchanged)", async () => {
    const contract = await createContractRow({ driveUploaded: false, driveFileId: null, preContractDriveFileId: null });
    let next = 0;
    mockGoogleApiFetch.mockImplementation(async () => ({ ok: true, data: { id: `created-${(next += 1)}` } }));

    expect(await uploadContractImageToDrive(contract.id, images)).toEqual({ ok: true });
    expect(calls().map((call) => call.method)).toEqual(["POST", "POST"]);

    const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(after).toMatchObject({ driveUploaded: true, driveFileId: "created-1", preContractDriveFileId: "created-2" });
  });
});
