import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user) redirect("/login"); // defense in depth alongside src/proxy.ts

  const collapsed = (await cookies()).get("sidebar_collapsed")?.value === "1";

  return (
    <AppShell
      user={{
        name: session.user.name ?? session.user.email ?? "Usuario",
        email: session.user.email ?? "",
        role: session.user.role,
      }}
      defaultCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
