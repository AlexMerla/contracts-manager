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
  sendContractWhatsApp: vi.fn(),
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
vi.mock("@/lib/whatsapp/highlevel-whatsapp", () => ({ sendContractWhatsApp: mocks.sendContractWhatsApp }));
vi.mock("@/lib/prisma", () => ({ prisma: { contract: { update: mocks.contractUpdate } } }));

import { runContractDeliveryPipeline, runContractEditPipeline } from "./delivery-pipeline";

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
    expect(mocks.sendContractWhatsApp).not.toHaveBeenCalled();
    // highlevel-whatsapp S2.6: the only column written is `imageGenerated` —
    // `whatsappSent` (and `emailSent`) are never reset by an edit.
    expect(mocks.contractUpdate).toHaveBeenCalledTimes(1);
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

describe("runContractDeliveryPipeline (step 5: WhatsApp through HighLevel)", () => {
  const pair = { contract: Buffer.from("c"), preContract: Buffer.from("p") };

  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.getContractImageBuffers.mockResolvedValue(pair);
    mocks.uploadContractImageToDrive.mockResolvedValue({ ok: true });
    mocks.upsertContractCalendarEvent.mockResolvedValue({ ok: true });
    mocks.sendContractEmail.mockResolvedValue({ ok: true });
    mocks.sendContractWhatsApp.mockResolvedValue({ ok: true });
    mocks.contractUpdate.mockResolvedValue({});
  });

  it("sends WhatsApp last, after email", async () => {
    await runContractDeliveryPipeline({ contractId: "contract-3" });

    expect(mocks.sendContractWhatsApp).toHaveBeenCalledWith("contract-3");
    expect(mocks.sendContractEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendContractWhatsApp.mock.invocationCallOrder[0] ?? 0
    );
  });

  // S2.2: a HighLevel failure never fails the pipeline.
  it("swallows a WhatsApp failure or throw without rejecting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sendContractWhatsApp.mockResolvedValueOnce({
      ok: false,
      message: "HighLevel no está disponible por el momento.",
    });
    await expect(runContractDeliveryPipeline({ contractId: "contract-4" })).resolves.toBeUndefined();

    mocks.sendContractWhatsApp.mockRejectedValueOnce(new Error("boom"));
    await expect(runContractDeliveryPipeline({ contractId: "contract-5" })).resolves.toBeUndefined();
  });
});
