// Minimal structural type instead of importing a Prisma transaction-client
// type directly: `scopeToOwner` (src/lib/authorization.ts) returns either the
// raw `PrismaClient` or a `$extends(...)` client depending on role, and the
// two don't share one convenient exported transaction-client type. This
// interface is the only thing `nextFolio` actually needs from `tx`.
interface FolioCountClient {
  contract: { count: () => Promise<number> };
}

// Folio format per docs/design-system.md §3: `CT-####`, generated at confirm
// time (spec §6.4 — "not before"). Sequential and zero-padded to at least 4
// digits, derived from the current contract count. At the spec's expected
// volume (~2 contracts/week, §1) a count-based scheme is simple and
// sufficient; the caller (src/app/(app)/contratos/actions.ts) retries on a
// unique-constraint collision instead of relying on this alone to be
// collision-free under concurrent writes.
export async function nextFolio(client: FolioCountClient): Promise<string> {
  const count = await client.contract.count();
  return `CT-${String(count + 1).padStart(4, "0")}`;
}
