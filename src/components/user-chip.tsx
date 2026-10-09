"use client";

import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/actions/sign-out";
import { Icon } from "@/components/ui/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ShellUser } from "@/components/app-shell";

interface UserChipProps {
  user: ShellUser;
  collapsed: boolean;
}

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

// Role label matches the convention in usuarios/page.tsx
// ("Super Usuario" / "Usuario Normal").
function roleLabel(role: ShellUser["role"]): string {
  return role === "super" ? "Super Usuario" : "Usuario Normal";
}

function InitialsCircle({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-xs font-medium text-[var(--brand-700)] dark:bg-[var(--brand-500)]/15 dark:text-[var(--brand-500)]">
      {initialsFor(name)}
    </span>
  );
}

// A direct one-click action, not a menu item: the icon itself is the
// affordance, so there's nothing to discover behind an extra click.
function SignOutButton({ tooltipSide }: { tooltipSide: "top" | "right" }) {
  return (
    <form action={signOutAction}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-hidden hover:bg-accent hover:text-destructive focus-visible:bg-accent"
            >
              <Icon icon={LogOut} />
            </button>
          }
        />
        <TooltipContent side={tooltipSide}>Cerrar sesión</TooltipContent>
      </Tooltip>
    </form>
  );
}

export function UserChip({ user, collapsed }: UserChipProps) {
  // Below the `md` breakpoint the sidebar is CSS-forced to its collapsed
  // (icon-only) width regardless of the `collapsed` prop (see app-shell.tsx),
  // so both visual forms render here and responsive classes pick the one
  // that matches the actual rendered width — same convention as
  // sidebar-nav.tsx's own collapsed-below-md handling.
  return (
    <>
      <div
        className={cn(
          "flex-col items-center gap-1 p-1.5",
          collapsed ? "flex" : "flex md:hidden"
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="flex cursor-default">
                <InitialsCircle name={user.name} />
              </span>
            }
          />
          <TooltipContent side="right">
            {user.name} · {roleLabel(user.role)}
          </TooltipContent>
        </Tooltip>
        <SignOutButton tooltipSide="right" />
      </div>

      <div
        className={cn(
          "items-center gap-2 rounded-md p-1.5",
          collapsed ? "hidden" : "hidden md:flex"
        )}
      >
        <InitialsCircle name={user.name} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{roleLabel(user.role)}</span>
        </span>
        <SignOutButton tooltipSide="top" />
      </div>
    </>
  );
}
