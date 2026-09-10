"use client";

import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/actions/sign-out";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Role label matches the existing convention from usuarios/page.tsx
// ("Super Usuario" / "Normal" — spec §"Footer user chip with sign-out"
// explicitly calls out that it is "Normal", not "Usuario").
function roleLabel(role: ShellUser["role"]): string {
  return role === "super" ? "Super Usuario" : "Normal";
}

function InitialsCircle({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
      {initialsFor(name)}
    </span>
  );
}

export function UserChip({ user, collapsed }: UserChipProps) {
  const trigger = (
    <DropdownMenuTrigger
      className={cn(
        "flex w-full items-center gap-2 rounded-md p-1.5 text-left outline-hidden hover:bg-accent focus-visible:bg-accent",
        collapsed && "justify-center"
      )}
    >
      <InitialsCircle name={user.name} />
      {!collapsed ? (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <Badge variant={user.role === "super" ? "ink" : "secondary"}>
            {roleLabel(user.role)}
          </Badge>
        </span>
      ) : null}
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent side="right">
            {user.name} · {roleLabel(user.role)}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOutAction} className="w-full">
          <DropdownMenuItem
            variant="destructive"
            render={<button type="submit" className="w-full" />}
          >
            <Icon icon={LogOut} />
            Cerrar sesión
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
