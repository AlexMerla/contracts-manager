import { cn } from "@/lib/utils";

// Single source of truth for monetary formatting per
// docs/design-system.md §2's `Money` domain component rule — every other
// place in the app that needs to render a peso amount should use this
// rather than calling `Intl.NumberFormat` ad hoc.
const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

// Tone is ALWAYS decided by the caller, never inferred from the sign:
// "saldo pendiente" is domain semantics, not arithmetic — a balance is
// never mathematically negative.
const TONE_CLASS = {
  positive: "text-success",
  negative: "text-danger",
  muted: "text-muted-foreground",
} as const;

interface MoneyProps {
  amount: number | null;
  className?: string;
  /** Prefix positive amounts with "+" (deltas, adjustments). Negative
   * amounts always get the unicode minus "−", regardless of this flag. */
  showSign?: boolean;
  /** Text shown when `amount` is null — "no price set" is a real, distinct
   * state (spec sprint-03 task 6), not the same as zero. */
  emptyLabel?: string;
  /** Caller-decided semantic color. NEVER inferred from the numeric sign —
   * see docs/design-system.md §2. */
  tone?: keyof typeof TONE_CLASS;
}

export function Money({
  amount,
  className,
  showSign = false,
  emptyLabel = "—",
  tone,
}: MoneyProps) {
  const toneClass = tone ? TONE_CLASS[tone] : undefined;

  if (amount == null) {
    return <span className={cn("tabular-nums", toneClass, className)}>{emptyLabel}</span>;
  }

  const prefix = amount < 0 ? "−" : showSign && amount > 0 ? "+" : "";

  return (
    <span className={cn("tabular-nums", toneClass, className)}>
      {prefix}
      {currencyFormatter.format(Math.abs(amount))}
    </span>
  );
}
