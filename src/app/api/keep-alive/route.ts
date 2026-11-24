import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// keep-alive: Supabase's free tier pauses a project after a stretch without
// database activity. The Vercel Schedule `supabase-keep-alive` in
// vercel.json calls this route once a day (GET — path schedules default to
// POST, so `requestMethod` is set explicitly) and the `SELECT 1` below is
// that activity. It is NOT part of the
// delivery pipeline and never retries anything — spec §4.2's "no cron job"
// rule is about replacing manual retry, which this does not touch (§11).
//
// Public in src/proxy.ts (no session — the scheduler has none), so it is
// gated by CRON_SECRET instead: Vercel sends `Authorization: Bearer
// <CRON_SECRET>` on every path-schedule run when that env var is set. Fail closed: with no
// secret configured, every request is rejected.
function isAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("Keep-alive query failed:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
