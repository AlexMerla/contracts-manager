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
// `whatsapp` has a status column since highlevel-whatsapp (`whatsappSent`):
// the standalone "Reintentar WhatsApp" is gated on it like the others, while
// the menu's "Reenviar por WhatsApp" stays available (re-entry sends again).
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
    /** Feedback once the action resolves without error. */
    successLabel: string;
  }
> = {
  drive: {
    action: retryDriveUpload,
    label: "Reintentar",
    menuLabel: "Reintentar subida a Drive",
    pendingLabel: "Subiendo…",
    successLabel: "Enviado.",
  },
  calendar: {
    action: retryCalendarEvent,
    label: "Reintentar",
    menuLabel: "Reintentar evento de Calendar",
    pendingLabel: "Creando evento…",
    successLabel: "Enviado.",
  },
  email: {
    action: retryEmail,
    label: "Reenviar correo",
    menuLabel: "Reenviar por correo",
    pendingLabel: "Enviando…",
    successLabel: "Enviado.",
  },
  whatsapp: {
    action: retryWhatsApp,
    label: "Reintentar WhatsApp",
    menuLabel: "Reenviar por WhatsApp",
    pendingLabel: "Enviando…",
    // "Sent" = handed to the HighLevel workflow, not delivered (spec §4.2).
    successLabel: "WhatsApp enviado al flujo de HighLevel.",
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
 * For the standalone retry buttons, success is self-evident: `revalidatePath`
 * inside the action flips the status column and the page's conditional
 * unmounts the control. The "Reenviar" menu never unmounts, so
 * `justSucceeded` is the feedback it gives.
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
