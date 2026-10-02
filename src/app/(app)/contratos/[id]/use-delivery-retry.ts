"use client";

import { useState } from "react";

import {
  retryCalendarEvent,
  retryDriveUpload,
  retryEmail,
  retryWhatsApp,
  type RetryDeliveryStepResult,
} from "../actions";

export type DeliveryStep = "drive" | "calendar" | "email" | "whatsapp";

// Sprint 6 task 8 / spec §4.2: one manual retry per incomplete delivery step,
// each re-running only its own step. The four steps differ solely in their
// action and their labels, which is exactly what this map parameterises —
// hence one table instead of four near-identical components.
//
// `whatsapp` has no status column (product decision — see `retryWhatsApp`'s
// doc comment), so unlike the other three the caller can't gate it on "still
// pending".
export const DELIVERY_STEPS: Record<
  DeliveryStep,
  {
    action: (contractId: string) => Promise<RetryDeliveryStepResult>;
    /** Label on the standalone retry button, next to the thing it repairs. */
    label: string;
    /** Label inside the consolidated "Reenviar" menu, where the surrounding
     *  trigger already says "reenviar" — so these read as destinations. */
    menuLabel: string;
    pendingLabel: string;
  }
> = {
  drive: {
    action: retryDriveUpload,
    label: "Reintentar",
    menuLabel: "Reintentar subida a Drive",
    pendingLabel: "Subiendo…",
  },
  calendar: {
    action: retryCalendarEvent,
    label: "Reintentar",
    menuLabel: "Reintentar evento de Calendar",
    pendingLabel: "Creando evento…",
  },
  email: {
    action: retryEmail,
    label: "Reenviar correo",
    menuLabel: "Reenviar por correo",
    pendingLabel: "Enviando…",
  },
  whatsapp: {
    action: retryWhatsApp,
    label: "Reenviar WhatsApp",
    menuLabel: "Reenviar por WhatsApp",
    pendingLabel: "Enviando…",
  },
};

export interface DeliveryRetryState {
  isRetrying: boolean;
  error: string | null;
  /** Only meaningful for a step whose control does NOT unmount on success —
   *  see the comment in `run`. */
  justSucceeded: boolean;
  run: () => Promise<void>;
}

/**
 * Shared run/error/success state for one delivery step's manual retry.
 * Extracted from `RetryStepButton` by the contract-detail redesign so the
 * consolidated "Reenviar" menu reuses the exact same semantics instead of
 * reimplementing them (and drifting).
 *
 * For drive/calendar/email, success is self-evident: `revalidatePath` inside
 * the action flips the status column and the page's conditional unmounts the
 * control. `whatsapp` has no status column, so its control never unmounts —
 * `justSucceeded` is the only feedback it can give. Harmless no-op for the
 * others (they're gone before it would render).
 */
export function useDeliveryRetry(contractId: string, step: DeliveryStep): DeliveryRetryState {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSucceeded, setJustSucceeded] = useState(false);
  const { action } = DELIVERY_STEPS[step];

  async function run() {
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

  return { isRetrying, error, justSucceeded, run };
}
