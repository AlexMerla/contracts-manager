import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex items-start gap-3 rounded-lg border border-transparent px-4 py-3 text-sm",
  {
    variants: {
      tone: {
        info: "bg-info-bg text-info-fg",
        success: "bg-success-bg text-success-fg",
        warning: "bg-warning-bg text-warning-fg",
        danger: "bg-danger-bg text-danger-fg",
      },
    },
    defaultVariants: { tone: "info" },
  }
);

type AlertAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

interface AlertProps extends VariantProps<typeof alertVariants> {
  icon?: LucideIcon;
  title: ReactNode;
  /** Content rule (design-system.md §2): the body must state cause AND
   *  suggested action — never a bare status statement. */
  description?: ReactNode;
  action?: AlertAction;
  className?: string;
}

export function Alert({ tone = "info", icon, title, description, action, className }: AlertProps) {
  return (
    <div role="status" data-slot="alert" className={cn(alertVariants({ tone }), className)}>
      {icon ? <Icon icon={icon} className="mt-0.5 size-4 shrink-0" /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description ? <p className="opacity-90">{description}</p> : null}
      </div>
      {action ? (
        <div className="shrink-0">
          {action.href ? (
            <Button size="sm" variant="ghost" render={<Link href={action.href} />}>
              {action.label}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
