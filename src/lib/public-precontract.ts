// Configuration surface for the public pre-contract flow.
//
// ZERO imports, on purpose — `src/proxy.ts` imports from here, and the proxy
// runs in the edge bundle. This is the same discipline `src/lib/navigation.ts`
// already follows ("name, NOT a component — keeps lucide out of proxy.ts's
// bundle"). Anything that needs Prisma lives in
// `@/lib/contracts/public-price-list` instead.

/** Route prefix. Single source of truth for `src/proxy.ts`'s
 * `PUBLIC_PREFIXES` entry and for every link built to the flow. */
export const PUBLIC_PRECONTRACT_PREFIX = "/precontrato";

/**
 * Second, independent kill switch (defense in depth alongside removing the
 * prefix from `src/proxy.ts`). Default is DISABLED: a deployment that has
 * never heard of this feature must not start accepting anonymous writes just
 * because the code shipped.
 *
 * Honest limitation: on Vercel, an environment-variable change only takes
 * effect on a NEW deployment, so this is NOT a faster rollback than editing
 * the proxy. Its value is that it gates the Server Action itself (independent
 * of route config) and that it can differ per environment — off in preview,
 * on in production. The genuinely instant rollback is promoting the previous
 * deployment (`vercel rollback`).
 */
export function isPublicPreContractEnabled(): boolean {
  return process.env.PUBLIC_PRECONTRACT_ENABLED === "true";
}
