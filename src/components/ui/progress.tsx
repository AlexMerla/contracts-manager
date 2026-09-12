"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "cn"

type ProgressTone = "accent" | "warning" | "success" | "auto"
type ResolvedTone = Exclude<ProgressTone, "auto">

/**
 * Collection-progress banding per docs/design-system.md §2: flat amber ->
 * indigo -> green bands, never a gradient. Exported as a pure function so it
 * is unit-testable without rendering JSX (same shape as format-money.test.ts).
 *
 * PROVISIONAL: the 50% / 100% thresholds are a placeholder until Sprint 8
 * defines the real collections business rule. Change them here only.
 *
 * NOTE (sdd-apply, ui-component-library): the spec's literal Requirement 8
 * text describes a 2-band split (accent for 0/null, warning for any partial
 * value, success at/over max) — that does NOT match this shipped, real
 * typechecked implementation. This is a known, already-resolved spec/design
 * conflict (design deviation #3): design-system.md §2 literally calls for
 * amber -> indigo -> green (3 bands) at a 50% threshold, and that is what is
 * implemented and tested here. Flagged for sdd-verify; the spec document
 * text is stale and should eventually be corrected, out of scope for this
 * change.
 */
export function resolveAutoTone(value: number | null, max = 100): ResolvedTone {
  if (value == null || max <= 0) return "warning"
  const pct = (value / max) * 100
  if (pct >= 100) return "success"
  if (pct >= 50) return "accent"
  return "warning"
}

const TONE_CLASS: Record<ResolvedTone, string> = {
  accent: "bg-primary",
  warning: "bg-warning",
  success: "bg-success",
}

function Progress({
  className,
  tone = "accent",
  value,
  max = 100,
  ...props
}: ProgressPrimitive.Root.Props & { tone?: ProgressTone }) {
  const resolved = tone === "auto" ? resolveAutoTone(value ?? null, max) : tone
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn("w-full", className)}
      {...props}
    >
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={cn("h-full transition-all", TONE_CLASS[resolved])}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
