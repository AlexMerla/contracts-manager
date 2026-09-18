"use client";

import { Check } from "lucide-react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface StepperStep {
  /** The caller's own stable step identifier (the wizard's `StepNumber`), NOT
   * the position rendered in the circle — a wizard that skips a conditional
   * stage must still number what it shows 1..N consecutively. */
  id: string | number;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentId: StepperStep["id"];
  className?: string;
}

// Plain presentational stepper — no `@base-ui/react` primitive exists for
// this, and there is no interaction to get right: the wizard owns navigation,
// the stepper only reports where the user is. Uppercase is deliberately NOT
// used on the labels (docs/design-system.md §3 reserves caps for micro-labels
// like table headers, never for anything title-like).
export function Stepper({ steps, currentId, className }: StepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentId);

  return (
    <ol
      data-slot="stepper"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}
    >
      {steps.map((step, index) => {
        const state =
          index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";

        return (
          <li
            key={step.id}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className="flex min-w-0 items-center gap-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors",
                state === "complete" && "bg-primary text-primary-foreground",
                state === "current" && "bg-foreground text-background",
                state === "upcoming" && "bg-muted text-muted-foreground"
              )}
            >
              {state === "complete" ? <Icon icon={Check} className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-sm",
                state === "upcoming" ? "text-muted-foreground" : "font-medium text-foreground"
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span aria-hidden="true" className="ml-1 hidden h-px w-8 shrink-0 bg-border sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
