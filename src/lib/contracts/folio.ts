// Minimal structural type instead of importing a Prisma transaction-client
// type directly: `scopeToOwner` (src/lib/authorization.ts) returns either the
// raw `PrismaClient` or a `$extends(...)` client depending on role, and the
// two don't share one convenient exported transaction-client type. This
// interface is the only thing `nextFolio` actually needs from `tx`.
interface FolioClient {
  contract: {
    findFirst: (args: {
      where: { folio: { not: { startsWith: string } } };
      orderBy: { folio: "desc" };
      select: { folio: true };
    }) => Promise<{ folio: string } | null>;
  };
}

// Legacy folios (`CT-0001`..`CT-0005`) predate this consecutive scheme and
// must never be treated as part of the new sequence: they are excluded from
// the "highest folio" lookup below, both so they're never re-issued and so
// they don't corrupt the lexicographic `ORDER BY` (a `CT-` prefix sorts
// after plain digits and would otherwise "win" the max).
const LEGACY_FOLIO_PREFIX = "CT-";

// One-time migration fact: the client's legacy numbering (paper contracts,
// pre-system) runs up to ~2999, so the new consecutive sequence starts here.
// This is a constant, not an env var — it must be identical in every
// environment and must never drift after go-live.
const FOLIO_START = 3000;

// Folio format per docs/design-system.md §3: a 5-digit, zero-padded,
// prefix-less consecutive number, generated at confirm time (spec §6.4 —
// "not before"). The next number is derived from the highest existing
// non-legacy folio (not a `count()`), because a count-based scheme re-issues
// a retired number whenever a row is deleted, which both risks a collision
// and makes the caller's retry loop futile — it would recompute the same
// value on every attempt. The caller (src/app/(app)/contratos/actions.ts)
// still retries on a unique-constraint collision under concurrent writes;
// max-based generation makes that retry actually correct, since a retry
// re-reads the now-committed max.
export async function nextFolio(client: FolioClient): Promise<string> {
  const highest = await client.contract.findFirst({
    where: { folio: { not: { startsWith: LEGACY_FOLIO_PREFIX } } },
    orderBy: { folio: "desc" },
    select: { folio: true },
  });

  const next = highest == null ? FOLIO_START : Math.max(FOLIO_START, Number(highest.folio) + 1);

  return String(next).padStart(5, "0");
}
