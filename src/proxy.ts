import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

// Broad, first-line protection: unauthenticated -> /login, normal role on a
// super-only prefix -> redirected away. This is defense-in-depth, not the
// only check — the pages/actions behind these routes call `requireRole`
// themselves too (spec's "enforced at the data-access layer, not only
// hidden in the UI", extended here to "not only in middleware either").
const SUPER_ONLY_PREFIXES = ["/usuarios"];
const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/auth");

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
