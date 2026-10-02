"use client";

import { Button } from "@/components/ui/button";

import { DELIVERY_STEPS, useDeliveryRetry, type DeliveryStep } from "./use-delivery-retry";

export type { DeliveryStep };

/**
 * Standalone retry control for one delivery step, rendered next to the thing
 * it repairs — the contract-detail redesign moved these out of a stack at the
 * top of the page and into the matching row of "Documento y respaldos", so a
 * failed Drive upload is now fixed from the Drive row itself.
 *
 * The run/error/success semantics live in `useDeliveryRetry`, shared with the
 * consolidated "Reenviar" menu in the page header.
 */
interface RetryStepButtonProps {
  contractId: string;
  step: DeliveryStep;
  /** Row placement wants compact copy; the standalone callers want the full
   *  sentence. Defaults to the step's own row-sized label. */
  label?: string;
}

export function RetryStepButton({ contractId, step, label }: RetryStepButtonProps) {
  const { isRetrying, error, justSucceeded, run } = useDeliveryRetry(contractId, step);
  const { label: defaultLabel, pendingLabel } = DELIVERY_STEPS[step];

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isRetrying} onClick={run}>
        {isRetrying ? pendingLabel : (label ?? defaultLabel)}
      </Button>
      {error && (
        <p role="alert" className="text-xs font-normal text-destructive">
          {error}
        </p>
      )}
      {justSucceeded && !error && <p className="text-xs font-normal text-success">Enviado.</p>}
    </div>
  );
}
