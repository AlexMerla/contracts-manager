"use client";

import { useState } from "react";

import { SidebarNav } from "@/components/sidebar-nav";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface ShellUser {
  name: string;
  email: string;
  role: "super" | "normal";
}

interface AppShellProps {
  user: ShellUser;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}

export function AppShell({ user, defaultCollapsed, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sidebar_collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-svh w-full">
        <aside
          className={
            "sticky top-0 h-svh shrink-0 border-r bg-sidebar transition-[width] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none " +
            (collapsed ? "w-16" : "w-16 md:w-[236px]")
          }
        >
          <SidebarNav user={user} collapsed={collapsed} onToggleCollapse={toggle} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </TooltipProvider>
  );
}
