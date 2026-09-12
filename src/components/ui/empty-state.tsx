import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// docs/design-system.md §2: a 26px lucide icon inside a neutral circle.
// Never an illustration, never an emoji.
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon={icon} className="size-[26px]" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-heading text-sm font-semibold">{title}</p>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
