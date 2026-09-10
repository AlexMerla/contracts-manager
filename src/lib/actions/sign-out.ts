"use server";

import { signOut } from "@/lib/auth";

// Server-action path, matching the convention in each module's actions.ts,
// rather than the client `next-auth/react` helper used by the login form.
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
