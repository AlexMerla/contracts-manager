import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { SUPER_ONLY_PREFIXES } from "@/lib/navigation";
import { PUBLIC_PRECONTRACT_PREFIX } from "@/lib/public-precontract";

// Broad, first-line protection: unauthenticated -> /login, normal role on a
// super-only prefix -> redirected away. This is defense-in-depth, not the
// only check — the pages/actions behind these routes call `requireRole`
// themselves too (spec's "enforced at the data-access layer, not only
// hidden in the UI", extended here to "not only in middleware either").
// The prefix list is derived from src/lib/navigation.ts so the sidebar and
// this guard can never disagree about which routes are super-only.
const PUBLIC_PATHS = ["/login"];

// Sprint-07 task 1 / spec §10: the contract viewer (and the route handler
// that serves its JPEG) is reached by clients who have no account at all, so
// it must be exempt from the redirect above. Guarded by the unguessable
// `viewer_token` in the URL, never by a session — a prefix, not an exact
// path, because the token and the `/image` sub-route follow it.
//
// public-precontract: `PUBLIC_PRECONTRACT_PREFIX` (`/precontrato`) is the
// SECOND public route and the first public one that WRITES. Removing this
// entry is the primary kill switch — the edge guard then 307s every GET
// *and* every Server Action POST (both hit this matcher at the page's own
// URL) to /login, with no database change. `isPublicPreContractEnabled()`
// inside the action itself (@/lib/public-precontract) is the independent
// second gate; see that module for why neither is instant on Vercel and
// what is (`vercel rollback`).
const PUBLIC_PREFIXES = ["/api/auth", "/contracts/view/", PUBLIC_PRECONTRACT_PREFIX];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const isSuperOnly = SUPER_ONLY_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (session && isSuperOnly && session.user.role !== "super") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
