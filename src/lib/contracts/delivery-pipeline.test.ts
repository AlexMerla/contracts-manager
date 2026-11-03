import { beforeEach, describe, expect, it, vi } from "vitest";

// edit-precontract (spec R12/S12.4) — the post-edit pipeline's ORDER and,
// above all, what it must NOT do: no email, no WhatsApp. Every collaborator
// is stubbed; nothing here touches the DB or a real external service.
const mocks = vi.hoisted(() => ({
  getContractImageBuffers: vi.fn(),
  generateContractImages: vi.fn(),
  uploadContractImageToDrive: vi.fn(),
  upsertContractCalendarEvent: vi.fn(),
  sendContractEmail: vi.fn(),
  triggerContractWhatsApp: vi.fn(),
  contractUpdate: vi.fn(),
}));
vi.mock("@/lib/contract-template/get-contract-image-buffer", () => ({
  getContractImageBuffers: mocks.getContractImageBuffers,
}));
vi.mock("@/lib/contract-template/generate-contract-image", () => ({
  generateContractImages: mocks.generateContractImages,
}));
vi.mock("@/lib/google/drive", () => ({ uploadContractImageToDrive: mocks.uploadContractImageToDrive }));
vi.mock("@/lib/google/calendar", () => ({ upsertContractCalendarEvent: mocks.upsertContractCalendarEvent }));
vi.mock("@/lib/email/contract-email", () => ({ sendContractEmail: mocks.sendContractEmail }));
vi.mock("@/lib/whatsapp/manychat", () => ({ triggerContractWhatsApp: mocks.triggerContractWhatsApp }));
vi.mock("@/lib/prisma", () => ({ prisma: { contract: { update: mocks.contractUpdate } } }));

import { runContractEditPipeline } from "./delivery-pipeline";

describe("runContractEditPipeline", () => {
  const pair = { contract: Buffer.from("c"), preContract: Buffer.from("p") };

  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.getContractImageBuffers.mockResolvedValue(pair);
    mocks.uploadContractImageToDrive.mockResolvedValue({ ok: true });
    mocks.upsertContractCalendarEvent.mockResolvedValue({ ok: true });
    mocks.contractUpdate.mockResolvedValue({});
  });

  it("regenerates, then overwrites Drive with that pair, then updates Calendar — never email or WhatsApp", async () => {
    await runContractEditPipeline("contract-1");

    expect(mocks.contractUpdate).toHaveBeenCalledWith({
      where: { id: "contract-1" },
      data: { imageGenerated: true },
    });
    expect(mocks.uploadContractImageToDrive).toHaveBeenCalledWith("contract-1", pair);
    expect(mocks.upsertContractCalendarEvent).toHaveBeenCalledWith("contract-1");
    expect(mocks.uploadContractImageToDrive.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upsertContractCalendarEvent.mock.invocationCallOrder[0] ?? 0
    );
    expect(mocks.sendContractEmail).not.toHaveBeenCalled();
    expect(mocks.triggerContractWhatsApp).not.toHaveBeenCalled();
  });

  it("is fail-open: a failed render or Drive still reaches Calendar, and nothing throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getContractImageBuffers.mockRejectedValue(new Error("canvas"));
    mocks.uploadContractImageToDrive.mockRejectedValue(new Error("drive down"));

    await expect(runContractEditPipeline("contract-2")).resolves.toBeUndefined();

    expect(mocks.contractUpdate).not.toHaveBeenCalled();
    expect(mocks.uploadContractImageToDrive).toHaveBeenCalledWith("contract-2", undefined);
    expect(mocks.upsertContractCalendarEvent).toHaveBeenCalledWith("contract-2");
  });
});
