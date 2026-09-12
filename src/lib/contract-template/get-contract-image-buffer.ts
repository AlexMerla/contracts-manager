import { prisma } from "@/lib/prisma";

import { generateContractImage, type ContractImageData } from "./generate-contract-image";

export class ContractNotFoundError extends Error {
  constructor(contractId: string) {
    super(`Contract ${contractId} not found.`);
    this.name = "ContractNotFoundError";
  }
}

// Sprint 5 task 6 — the on-demand regeneration primitive. Fetches a
// contract's CURRENT stored data and regenerates its image from scratch
// every time; there is no persisted image file/blob to read back instead
// (that's Sprint 6's Drive upload) — the image is derived data. Reused by:
// the manual retry action (src/app/(app)/contratos/actions.ts), and,
// later, Drive upload / email attachment / the public viewer.
//
// Deliberately unscoped by owner: callers that run on behalf of a logged-in
// user (the retry action) check ownership themselves via `scopeToOwner`
// before calling this; callers that run without any user session at all
// (Drive upload, email sending, the public viewer keyed by `viewer_token`)
// have no session to scope by in the first place.
export async function getContractImageBuffer(contractId: string): Promise<Buffer> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { contractPackages: true },
  });

  if (!contract) {
    throw new ContractNotFoundError(contractId);
  }

  const data: ContractImageData = {
    folio: contract.folio,
    eventDate: contract.eventDate,
    eventTime: contract.eventTime,
    clientName: contract.clientName,
    eventType: contract.eventType,
    clientAddress: contract.clientAddress,
    celebrated: contract.celebrated,
    clientEmail: contract.clientEmail,
    clientPhone: contract.clientPhone,
    clientMobile: contract.clientMobile,
    placeName: contract.placeName,
    placeAddress: contract.placeAddress,
    services: contract.contractPackages.map((line) => ({
      name: line.nameSnapshot,
      quantity: line.quantity,
    })),
    total: Number(contract.total),
    deposit: Number(contract.deposit),
    balance: Number(contract.balance),
  };

  return generateContractImage(data);
}
