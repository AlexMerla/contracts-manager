"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import {
  retryCalendarEvent,
  retryDriveUpload,
  retryEmail,
  retryWhatsApp,
  type RetryDeliveryStepResult,
} from "../actions";

export type DeliveryStep = "drive" | "calendar" | "email" | "whatsapp";

// Sprint 6 task 8 / spec §4.2: one manual retry control per incomplete
// delivery step, each re-running only its own step. Drive and Calendar share
// this single component (they differ only in label and action) instead of
// getting a near-identical copy each. `RetryImageButton` is left as-is —
// folding it in here is a trivial follow-up, not sprint-06 scope.
//
// Sprint 7 task 3 adds `email` here rather than building a third retry
// component: it differs from the other two only in its label and its action,
// which is exactly what this map already parameterises.
//
// `whatsapp` has no status column (product decision — see `retryWhatsApp`'s
// doc comment), so unlike the other three, the caller can't gate this one on
// "still pending": it renders unconditionally, same permanence as the
// copyable link it sits next to.
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
  email: {
    action: retryEmail,
    label: "Reenviar correo al cliente",
    pendingLabel: "Enviando…",
  },
  whatsapp: {
    action: retryWhatsApp,
    label: "Reenviar WhatsApp",
    pendingLabel: "Enviando…",
  },
};

interface RetryStepButtonProps {
  contractId: string;
  step: DeliveryStep;
}

export function RetryStepButton({ contractId, step }: RetryStepButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // For drive/calendar/email, success is self-evident: `revalidatePath`
  // flips the status column and the conditional in the detail page unmounts
  // this whole component. `whatsapp` has no status column, so its instance
  // never unmounts — without this, a successful click would give zero
  // feedback. Harmless no-op for the other steps (they're gone before it'd
  // render).
  const [justSucceeded, setJustSucceeded] = useState(false);
  const { action, label, pendingLabel } = STEPS[step];

  async function onRetry() {
    setIsRetrying(true);
    setError(null);
    setJustSucceeded(false);
    const result = await action(contractId);
    setIsRetrying(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setJustSucceeded(true);
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
      {justSucceeded && !error && (
        <p className="text-xs font-normal text-success">Enviado.</p>
      )}
    </div>
  );
}
