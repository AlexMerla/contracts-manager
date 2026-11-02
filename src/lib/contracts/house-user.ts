import { prisma } from "@/lib/prisma";

// public-precontract Q1 — `contracts.created_by_id` is a required FK
// (prisma/schema.prisma) and three consumers dereference `createdBy.name`
// with no null handling (`src/lib/reports/fetch-report-rows.ts`,
// `src/lib/dashboard/fetch-dashboard.ts`, `src/app/(app)/contratos/page.tsx`).
// Rather than make the column nullable, every publicly-created contract is
// owned by ONE seeded "house" user, so `createdBy.name` renders as
// "Cliente (web)" everywhere a creator is shown — no new `source` column, no
// typed breakage, no magic-id checks in the UI.
//
// Consequence, accepted in Q5: `scopeToOwner` rewrites a `normal` session's
// contract queries to `createdById = self`, so these rows are visible to
// `super` only.

/** Not a deliverable address. The domain is RFC 2606 `.invalid`, so this can
 * never collide with a real mailbox and can never receive mail. */
export const HOUSE_USER_EMAIL = "cliente-web@precontrato.invalid";
export const HOUSE_USER_NAME = "Cliente (web)";

export class HouseUserMissingError extends Error {
  constructor() {
    super(
      `El usuario "${HOUSE_USER_NAME}" (${HOUSE_USER_EMAIL}) no existe. ` +
        "Ejecute `npm run db:seed` en este entorno antes de habilitar el flujo público de precontrato."
    );
    this.name = "HouseUserMissingError";
  }
}

/**
 * Resolves the house user's id. Looked up by its stable email, never
 * hard-coded as a uuid — a uuid would differ per environment and a seed
 * re-run must not change the answer.
 *
 * @throws {HouseUserMissingError} when the row is absent. The public action
 * catches this and returns a generic message: a misconfigured environment
 * must fail loudly in the logs and silently to the anonymous visitor.
 */
export async function getHouseUserId(): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email: HOUSE_USER_EMAIL },
    select: { id: true },
  });

  if (!user) {
    throw new HouseUserMissingError();
  }

  return user.id;
}
