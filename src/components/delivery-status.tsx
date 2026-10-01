"use client";

import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Spec §4.2 point 4: "The contract list UI must show a visual indicator for
// any contract with an incomplete step." These are the boolean status
// columns the sequential, in-process post-confirmation pipeline writes on
// `contracts` — the same flags the detail page's retry controls read.
//
// Sprint 7 task 7 adds `emailSent` as the fourth step. The WhatsApp trigger
// is deliberately NOT here: spec §6.4 defines no status column for it, so
// there is nothing truthful to report — the detail page's copyable link
// (task 5) is its fallback instead.
export interface DeliverySteps {
  imageGenerated: boolean;
  driveUploaded: boolean;
  calendarCreated: boolean;
  emailSent: boolean;
  /**
   * Whether the contract even has a `clientEmail`. `client_email` is nullable
   * (spec §6.4), and for a contract recorded without one there is nothing to
   * send and no retry that could ever succeed — so the email step is not
   * "pending", it is not applicable. Without this, every walk-in contract
   * taken by phone would wear a permanent warning badge and poison the "Con
   * pendientes" count, training staff to ignore the indicator entirely.
   */
  hasClientEmail: boolean;
}

// Order matches the pipeline's own execution order (image → Drive → Calendar
// → correo) and the order of the retry buttons on the contract detail page,
// so the tooltip reads in the same sequence the operator sees when they open
// it.
const DELIVERY_STEPS: { key: keyof DeliverySteps; label: string }[] = [
  { key: "imageGenerated", label: "Imagen del contrato" },
  { key: "driveUploaded", label: "Respaldo en Drive" },
  { key: "calendarCreated", label: "Evento en Calendar" },
  { key: "emailSent", label: "Correo al cliente" },
];

/**
 * Pending step labels, in pipeline order. Pure and exported so both the list's
 * "Con pendientes" filter and the unit test use the exact same rule — the
 * indicator and the filter can never disagree about what "pendiente" means.
 */
export function pendingDeliverySteps(steps: DeliverySteps): string[] {
  return DELIVERY_STEPS.filter(({ key }) => {
    if (key === "emailSent" && !steps.hasClientEmail) {
      return false;
    }
    return !steps[key];
  }).map(({ label }) => label);
}

/** Derived from `pendingDeliverySteps` rather than re-stating the rule, so the
 * filter and the badge cannot drift apart as steps are added. */
export function hasPendingDelivery(steps: DeliverySteps): boolean {
  return pendingDeliverySteps(steps).length > 0;
}

/**
 * Read-only indicator. Deliberately has NO retry action: the detail page
 * already owns one control per step (`RetryImageButton` / `RetryStepButton`),
 * and duplicating them per row would put four destructive-ish network calls
 * inside a scannable table. The tooltip points at the detail page instead.
 */
export function DeliveryStatus(steps: DeliverySteps) {
  const pending = pendingDeliverySteps(steps);

  if (pending.length === 0) {
    // Common case: no glyph at all. A column of green check marks on every row
    // would out-shout the two StatusPills next to it; silence makes the
    // exceptional row the only thing the eye catches. `sr-only` keeps the cell
    // meaningful for assistive tech, which cannot perceive "quiet" as a value.
    return <span className="sr-only">Entrega completa</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="warning" tabIndex={0} className="cursor-default">
            <Icon icon={TriangleAlert} aria-hidden="true" />
            {pending.length === 1 ? "Falta 1 paso" : `Faltan ${pending.length} pasos`}
          </Badge>
        }
      />
      {/* Content rule, docs/design-system.md §3: concrete and numeric, never
          alarmist — name the steps, then the action, no dramatized warning. */}
      <TooltipContent side="top">
        Pendiente: {pending.join(" · ")}. Abra el contrato para reintentar.
      </TooltipContent>
    </Tooltip>
  );
}
