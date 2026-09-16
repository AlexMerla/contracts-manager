"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Formatting-only counterpart to `src/components/money.tsx`'s read-only
// `Money` — same `es-MX` locale, but no currency `style` here: the `$` is a
// separate prefix adornment, not part of the `Intl` output (see task spec).
const moneyFormatter = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface MoneyInputProps
  extends Omit<
    React.ComponentProps<typeof Input>,
    "value" | "onChange" | "type" | "inputMode"
  > {
  value: string;
  /** Called with the raw, unformatted string the user typed — validation
   * and parsing to a number stays the caller's responsibility. */
  onChange: (rawValue: string) => void;
}

/**
 * Editable peso-amount input with a `$` prefix adornment.
 *
 * While focused, shows the raw value so the user can type digits and a
 * decimal point without a live mask fighting the cursor. On blur, if the
 * value parses as a number it's redisplayed with `es-MX` thousands
 * separators for a polished "at rest" look — the underlying raw value
 * handed to `onChange` never changes because of this, only the display.
 *
 * An empty value is left empty rather than formatted to "$0.00" — an empty
 * price is a real, distinct state in this app (see `Money`'s `emptyLabel`).
 */
export function MoneyInput({
  value,
  onChange,
  className,
  onFocus,
  onBlur,
  ...props
}: MoneyInputProps) {
  const [isFocused, setIsFocused] = React.useState(false);

  const displayValue = React.useMemo(() => {
    if (isFocused) return value;
    if (value.trim() === "") return "";
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return value;
    return moneyFormatter.format(numeric);
  }, [isFocused, value]);

  return (
    <div className={cn("relative", className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground"
      >
        $
      </span>
      <Input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        className="pl-6"
        {...props}
      />
    </div>
  );
}
