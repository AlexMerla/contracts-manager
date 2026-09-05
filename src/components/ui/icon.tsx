import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Domain wrapper per docs/design-system.md §2 — thin lucide-react wrapper,
// fixed strokeWidth. Takes the icon component directly (not a name string)
// since that's more idiomatic for a typed React codebase than maintaining a
// name → component lookup table.
interface IconProps extends Omit<React.ComponentProps<"svg">, "ref"> {
  icon: LucideIcon;
}

export function Icon({ icon: IconComponent, className, ...props }: IconProps) {
  return (
    <IconComponent
      strokeWidth={1.75}
      className={cn("size-4", className)}
      {...props}
    />
  );
}
