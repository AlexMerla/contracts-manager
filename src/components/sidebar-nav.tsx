"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";

import { NAV_GROUP_ORDER, navItemsForRole, type NavGroup } from "@/lib/navigation";
import { NAV_ICONS } from "@/components/nav-icons";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserChip } from "@/components/user-chip";
import { cn } from "@/lib/utils";
import type { ShellUser } from "@/components/app-shell";

interface SidebarNavProps {
  user: ShellUser;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function groupLabel(group: NavGroup | null): string | null {
  return group;
}

export function SidebarNav({ user, collapsed, onToggleCollapse }: SidebarNavProps) {
  const pathname = usePathname();
  // Cosmetic only. Enforcement is src/proxy.ts + requireRole in every page and action (spec §5).
  const items = navItemsForRole(user.role);

  return (
    <nav className="flex h-full flex-col gap-1 p-2">
      <div className={cn("flex items-center px-2 py-2", collapsed ? "justify-center" : "justify-end")}>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-expanded={!collapsed}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Icon icon={collapsed ? PanelLeft : PanelLeftClose} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {NAV_GROUP_ORDER.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;

          const label = groupLabel(group);

          return (
            <div key={group ?? "root"} className="flex flex-col gap-1">
              {label ? (
                collapsed ? (
                  <Separator className="mx-2 my-1" />
                ) : (
                  <span className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {label}
                  </span>
                )
              ) : null}

              {groupItems.map((item) => {
                const active = isActive(pathname, item.href);
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
                      collapsed && "justify-center",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon icon={NAV_ICONS[item.icon]} />
                    {!collapsed ? <span>{item.label}</span> : null}
                  </Link>
                );

                if (!collapsed) return link;

                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger render={link} />
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          );
        })}
      </div>

      <UserChip user={user} collapsed={collapsed} />
    </nav>
  );
}
