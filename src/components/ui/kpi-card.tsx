import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface KpiTrend {
  direction: "up" | "down";
  label: string;
}

// `trend` and `context` are mutually exclusive: a KPI either has a direction
// (arrow + color) or a plain grey caption, never both.
type KpiCardProps = {
  label: string;
  value: ReactNode; // may embed <Money />
  icon?: LucideIcon;
  className?: string;
} & ({ trend?: KpiTrend; context?: never } | { context?: string; trend?: never });

export function KpiCard({ label, value, icon, trend, context, className }: KpiCardProps) {
  return (
    <div
      data-slot="kpi-card"
      className={cn(
        "flex flex-col gap-2 rounded-lg bg-card p-4 ring-1 shadow-sm ring-foreground/10",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {icon ? <Icon icon={icon} className="size-4 text-muted-foreground" /> : null}
      </div>
      <div className="font-heading text-2xl font-semibold tabular-nums">{value}</div>
      {trend ? (
        <p className="flex items-center gap-1 text-xs">
          {/* Unicode arrow, NEVER a lucide icon — docs/design-system.md §2. */}
          <span aria-hidden="true" className={trend.direction === "up" ? "text-success" : "text-danger"}>
            {trend.direction === "up" ? "▲" : "▼"}
          </span>
          <span className="text-muted-foreground">{trend.label}</span>
        </p>
      ) : context ? (
        <p className="text-xs text-muted-foreground">{context}</p>
      ) : null}
    </div>
  );
}
