"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import {
  retryCalendarEvent,
  retryDriveUpload,
  type RetryDeliveryStepResult,
} from "../actions";

export type DeliveryStep = "drive" | "calendar";

// Sprint 6 task 8 / spec §4.2: one manual retry control per incomplete
// delivery step, each re-running only its own step. Drive and Calendar share
// this single component (they differ only in label and action) instead of
// getting a near-identical copy each. `RetryImageButton` is left as-is —
// folding it in here is a trivial follow-up, not sprint-06 scope.
const STEPS: Record<
  DeliveryStep,
  {
    action: (contractId: string) => Promise<RetryDeliveryStepResult>;
    label: string;
    pendingLabel: string;
  }
> = {
  drive: {
    action: retryDriveUpload,
    label: "Reintentar subida a Drive",
    pendingLabel: "Subiendo…",
  },
  calendar: {
    action: retryCalendarEvent,
    label: "Reintentar evento de Calendar",
    pendingLabel: "Creando evento…",
  },
};

interface RetryStepButtonProps {
  contractId: string;
  step: DeliveryStep;
}

export function RetryStepButton({ contractId, step }: RetryStepButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { action, label, pendingLabel } = STEPS[step];

  async function onRetry() {
    setIsRetrying(true);
    setError(null);
    const result = await action(contractId);
    setIsRetrying(false);
    if ("error" in result) {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isRetrying} onClick={onRetry}>
        {isRetrying ? pendingLabel : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs font-normal text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
