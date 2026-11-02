import { prisma } from "@/lib/prisma";

export interface PublicPriceList {
  id: string;
  name: string;
}

/**
 * The ONE price list the public /precontrato flow prices from:
 * `isPublic && active`.
 *
 * Returns `null` when none is configured — a real, expected state, not an
 * error. The production database currently has no `isDefault: true` row
 * either, which is exactly why this must never assume a row exists: the
 * public page renders a "no disponible por el momento" state and
 * `createPublicPreContract` refuses.
 *
 * `findFirst` with a deterministic order, not `findUnique`: "at most one
 * public list" is an application-layer invariant enforced in
 * `setPriceListPublic` (same as `isDefault`, spec §6.9) with no database
 * constraint behind it, so a hand-edited database with two flagged rows must
 * still resolve to one stable answer rather than throwing.
 *
 * Kept out of `@/lib/public-precontract` because that module is imported by
 * `src/proxy.ts` and must stay free of the Prisma client.
 */
export async function getPublicPriceList(): Promise<PublicPriceList | null> {
  return prisma.priceList.findFirst({
    where: { isPublic: true, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}
