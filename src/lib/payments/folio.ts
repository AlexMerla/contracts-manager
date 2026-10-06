// Minimal structural type instead of importing a Prisma transaction-client
// type directly — same rationale as `src/lib/contracts/folio.ts`'s
// `FolioClient`: `scopeToOwner` (src/lib/authorization.ts) returns either the
// raw `PrismaClient` or a `$extends(...)` client depending on role, and the
// two don't share one convenient exported transaction-client type.
interface PaymentFolioClient {
  payment: {
    findFirst: (args: {
      orderBy: { folio: "desc" };
      select: { folio: true };
    }) => Promise<{ folio: string } | null>;
  };
}

const PAYMENT_FOLIO_PREFIX = "PG-";

/**
 * Payments get their own consecutive sequence, independent from
 * `nextFolio`'s contract numbering (sprint-08 proposal/design): `PG-0001`,
 * `PG-0002`, ... — a 4-digit, zero-padded, `PG-`-prefixed folio. Unlike
 * `nextFolio` there is no legacy prefix to exclude and no `FOLIO_START`
 * floor — payments are a brand-new concept with no pre-system numbering to
 * reconcile against.
 *
 * Max-based, not `count()`, for the same reason as contracts: a count-based
 * scheme re-issues a retired number whenever a row is deleted, which both
 * risks a collision and makes the caller's retry loop futile. The caller
 * (`registerPayment`) retries on a unique-constraint collision under
 * concurrent writes; max-based generation makes that retry actually correct,
 * since a retry re-reads the now-committed max.
 *
 * Lexicographic `ORDER BY folio DESC` is only correct while every folio
 * shares the same digit width — past `PG-9999` the string `"PG-10000"`
 * would sort before `"PG-9999"`. The unique index on `payments.folio` turns
 * that eventual wrap into a hard failure, never a silent duplicate.
 */
export async function nextPaymentFolio(client: PaymentFolioClient): Promise<string> {
  const highest = await client.payment.findFirst({
    orderBy: { folio: "desc" },
    select: { folio: true },
  });

  const next = highest == null ? 1 : Number(highest.folio.slice(PAYMENT_FOLIO_PREFIX.length)) + 1;

  return `${PAYMENT_FOLIO_PREFIX}${String(next).padStart(4, "0")}`;
}
