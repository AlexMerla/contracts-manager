"use client";

import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { DELIVERY_STEPS, useDeliveryRetry } from "./use-delivery-retry";

/**
 * Consolidated "Reenviar" action in the detail page header: one trigger for
 * the two channels that deliver the viewer link to the CLIENT (correo,
 * WhatsApp). Drive/Calendar/image retries are deliberately NOT here — those
 * repair internal artefacts and now live on their own row in "Documento y
 * respaldos", next to the thing they fix.
 *
 * Each item is gated on the contact datum its channel needs: a contract with
 * no `clientEmail` has no email to resend, and offering an action that can
 * only ever fail is noise (same rule the detail page applies to the email
 * retry button and `DeliveryStatus` applies to the list indicator). When
 * neither exists the menu renders nothing at all.
 */
interface ResendMenuProps {
  contractId: string;
  hasEmail: boolean;
  hasMobile: boolean;
}

export function ResendMenu({ contractId, hasEmail, hasMobile }: ResendMenuProps) {
  const email = useDeliveryRetry(contractId, "email");
  const whatsapp = useDeliveryRetry(contractId, "whatsapp");

  if (!hasEmail && !hasMobile) {
    return null;
  }

  const busy = email.isRetrying || whatsapp.isRetrying;
  // One shared feedback line: only one item can be running at a time, so
  // whichever channel last reported wins. Errors outrank successes.
  const error = email.error ?? whatsapp.error;
  const succeeded = !error && (email.justSucceeded || whatsapp.justSucceeded);

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>
          <Send aria-hidden="true" />
          {busy ? "Enviando…" : "Reenviar"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hasEmail && (
            <DropdownMenuItem disabled={busy} onClick={email.run}>
              {DELIVERY_STEPS.email.menuLabel}
            </DropdownMenuItem>
          )}
          {hasMobile && (
            <DropdownMenuItem disabled={busy} onClick={whatsapp.run}>
              {DELIVERY_STEPS.whatsapp.menuLabel}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="text-xs font-normal text-destructive">
          {error}
        </p>
      )}
      {succeeded && <p className="text-xs font-normal text-success">Enviado.</p>}
    </div>
  );
}
