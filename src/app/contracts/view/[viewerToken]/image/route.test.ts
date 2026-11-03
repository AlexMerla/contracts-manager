import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real database, no mocks (the project's pattern) — and no external system
// is reachable from this route at all: it only reads the row and renders
// the JPEG in-process.
import { prisma } from "@/lib/prisma";

import { GET } from "./route";

import type { ContractStatus } from "@/generated/prisma/client";

const userId = randomUUID();
const priceListId = randomUUID();
const contractId = randomUUID();
const viewerToken = randomUUID();
// `CT-TEST-` (the legacy prefix `nextFolio` skips), never a free-form
// string: anything sorting after the digits would be read as the highest
// folio by a concurrently running createContract test and yield "00NaN".
const folio = `CT-TEST-${contractId.slice(0, 8)}`;

function requestImage(token: string): Promise<Response> {
  return GET(new Request(`http://localhost/contracts/view/${token}/image`), {
    params: Promise.resolve({ viewerToken: token }),
  });
}

async function setStatus(contractStatus: ContractStatus): Promise<void> {
  await prisma.contract.update({
    where: { id: contractId },
    data: { contractStatus },
  });
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: userId,
      name: "Throwaway (viewer image route test)",
      email: `throwaway-viewer-image-${userId}@example.com`,
      passwordHash: "unused-in-this-test",
      role: "normal",
    },
  });
  await prisma.priceList.create({
    data: { id: priceListId, name: "Throwaway (viewer image route test)" },
  });
  await prisma.contract.create({
    data: {
      id: contractId,
      folio,
      clientName: "Cliente de prueba",
      eventType: "other",
      eventDate: new Date("2027-01-01T00:00:00.000Z"),
      subtotal: 0,
      total: 0,
      deposit: 0,
      balance: 0,
      viewerToken,
      priceListId,
      createdById: userId,
    },
  });
});

afterAll(async () => {
  await prisma.contract.delete({ where: { id: contractId } });
  await prisma.priceList.delete({ where: { id: priceListId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe("GET /contracts/view/[viewerToken]/image", () => {
  it("serves the pre-contract while pre_contract, then the contract once confirmed, with no re-send", async () => {
    await setStatus("pre_contract");
    const pre = await requestImage(viewerToken);
    expect(pre.status).toBe(200);
    expect(pre.headers.get("Content-Type")).toBe("image/jpeg");
    expect(pre.headers.get("Content-Disposition")).toBe(
      `inline; filename="Precontrato${folio}.jpg"`
    );
    const preBytes = Buffer.from(await pre.arrayBuffer());

    await setStatus("confirmed");
    const confirmed = await requestImage(viewerToken);
    expect(confirmed.status).toBe(200);
    expect(confirmed.headers.get("Content-Disposition")).toBe(
      `inline; filename="Contrato${folio}.jpg"`
    );
    const confirmedBytes = Buffer.from(await confirmed.arrayBuffer());

    // Same stored data, different base template — the bytes must differ.
    expect(preBytes.equals(confirmedBytes)).toBe(false);
  });

  it("keeps serving the contract once completed", async () => {
    await setStatus("completed");
    const response = await requestImage(viewerToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      `inline; filename="Contrato${folio}.jpg"`
    );
  });

  it("404s a cancelled contract exactly like an unknown token", async () => {
    await setStatus("cancelled");
    const cancelled = await requestImage(viewerToken);
    const unknown = await requestImage(randomUUID());

    expect(cancelled.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await cancelled.text()).toBe(await unknown.text());
    expect(cancelled.headers.get("Content-Type")).toBe(unknown.headers.get("Content-Type"));
  });
});
