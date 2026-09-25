import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/authorization";
import { saveGoogleConnection } from "@/lib/google/connection";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  exchangeGoogleCodeForTokens,
  fetchGoogleAccountEmail,
  googleRedirectUri,
} from "@/lib/google/oauth";

// Callback leg of Flow B (spec §4.3). `super`-only, same as /api/google/connect
// — re-checked here independently since this route is reachable on its own.
export async function GET(request: Request) {
  const session = await auth();
  let validSession;
  try {
    validSession = requireRole(session, "super");
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    throw error;
  }

  const url = new URL(request.url);
  const settingsUrl = new URL("/configuracion", request.url);

  function fail(message: string) {
    settingsUrl.searchParams.set("error", message);
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return fail(`Google devolvió un error: ${oauthError}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((entry) => entry.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`))
    ?.split("=")[1];

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail(
      "La solicitud de conexión no pudo validarse (estado inválido o expirado). Intente conectar de nuevo."
    );
  }

  try {
    const redirectUri = googleRedirectUri(request.url);
    const { refreshToken, accessToken } = await exchangeGoogleCodeForTokens({ code, redirectUri });
    const connectedEmail = await fetchGoogleAccountEmail(accessToken);
    await saveGoogleConnection({ refreshToken, connectedEmail, connectedById: validSession.user.id });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "No se pudo completar la conexión con Google."
    );
  }

  settingsUrl.searchParams.set("success", "1");
  const response = NextResponse.redirect(settingsUrl);
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}
