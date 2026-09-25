import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  buildGoogleAuthorizationUrl,
  googleRedirectUri,
} from "@/lib/google/oauth";

// `super`-only (spec §5: "Google Master connection ... reconnect action" is
// super-only). Starts Flow B (spec §4.3) — separate from Auth.js, no shared
// session/tokens with user login. GET, not a Server Action, because the
// destination is an external redirect to Google's consent screen.
export async function GET(request: Request) {
  const session = await auth();
  try {
    requireRole(session, "super");
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    throw error;
  }

  let authorizationUrl: string;
  try {
    const state = randomBytes(16).toString("hex");
    const redirectUri = googleRedirectUri(request.url);
    authorizationUrl = buildGoogleAuthorizationUrl({ redirectUri, state });

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes — long enough for a human to complete consent
      path: "/api/google",
    });
    return response;
  } catch (error) {
    const settingsUrl = new URL("/configuracion", request.url);
    settingsUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "No se pudo iniciar la conexión con Google."
    );
    return NextResponse.redirect(settingsUrl);
  }
}
