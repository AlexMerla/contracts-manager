import { describe, expect, it, vi } from "vitest";

// public-precontract: the explicit regression test the spec/tasks both
// flagged — proving the `PUBLIC_PREFIXES` registration in src/proxy.ts
// actually matters, not just that the registered route happens to work.
// `auth()` (next-auth's dual-purpose session/middleware wrapper) is mocked
// to identity: it normally injects `req.auth` from a real JWT, but here each
// test supplies `req.auth` directly on its fake request, so the proxy's own
// routing logic runs unmodified and unmocked. Same hoisting convention as
// src/app/(app)/contratos/contratos-actions.test.ts: `vi.mock` calls first,
// then regular imports.
vi.mock("@/lib/auth", () => ({
  auth: (handler: (req: unknown) => unknown) => handler,
}));

import { NextResponse } from "next/server";

import proxyMiddleware from "@/proxy";

// The real `auth()` HOF types its wrapped export as a 2-arg NextMiddleware
// (request, ctx). The mock above only ever calls through with the request
// it's given, and these tests never need the second arg — cast the call
// surface down to what the mock actually does at runtime.
const middleware = proxyMiddleware as unknown as (req: unknown) => unknown;

function fakeRequest(pathname: string, session: unknown = null) {
  return {
    nextUrl: new URL(`https://example.com${pathname}`),
    auth: session,
  };
}

describe("proxy PUBLIC_PREFIXES", () => {
  it("lets an anonymous GET to the registered /precontrato prefix through with no redirect", () => {
    const result = middleware(fakeRequest("/precontrato"));
    expect(result).toBeUndefined();
  });

  it("also lets an anonymous GET to a /precontrato sub-path through (prefix match, not exact)", () => {
    // A Server Action POSTs to its own page pathname, so this also covers
    // "the action's POST hits the same guard" per the design's kill-switch
    // note — the match is on pathname alone, with no method distinction.
    const result = middleware(fakeRequest("/precontrato/algo"));
    expect(result).toBeUndefined();
  });

  // THE NEGATIVE CASE: proves the registration actually matters. If
  // `PUBLIC_PRECONTRACT_PREFIX` were ever removed from `PUBLIC_PREFIXES`,
  // `/precontrato` would fall into this same "anonymous + not public ->
  // redirect to /login" branch, exactly like any other unregistered,
  // protected route does today.
  it("redirects an anonymous GET to an unregistered, non-public route to /login", () => {
    const result = middleware(fakeRequest("/contratos"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(307);
    expect((result as NextResponse).headers.get("location")).toBe("https://example.com/login");
  });

  it("still lets an authenticated normal session through to a non-public route", () => {
    const result = middleware(
      fakeRequest("/contratos", {
        user: { id: "u1", role: "normal", name: "Normal", email: "normal@example.com" },
      })
    );
    expect(result).toBeUndefined();
  });
});
