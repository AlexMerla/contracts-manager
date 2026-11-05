"use client";

import { useState } from "react";
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
 * no `clientEmail` has no email to resend (nor one without a valid mobile a
 * WhatsApp), and offering an action that can
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
  // Which channel the success line speaks for: each has its own copy.
  const [lastChannel, setLastChannel] = useState<"email" | "whatsapp">("email");

  if (!hasEmail && !hasMobile) {
    return null;
  }

  const busy = email.isRetrying || whatsapp.isRetrying;
  // One shared feedback line: only one item can be running at a time, so
  // the channel clicked last is the one reported.
  const lastRun = lastChannel === "whatsapp" ? whatsapp : email;
  const { error } = lastRun;
  const succeeded = !error && lastRun.justSucceeded ? DELIVERY_STEPS[lastChannel].successLabel : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>
          <Send aria-hidden="true" />
          {busy ? "Enviando…" : "Reenviar"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hasEmail && (
            <DropdownMenuItem
              disabled={busy}
              onClick={() => {
                setLastChannel("email");
                void email.run();
              }}
            >
              {DELIVERY_STEPS.email.menuLabel}
            </DropdownMenuItem>
          )}
          {hasMobile && (
            <DropdownMenuItem
              disabled={busy}
              onClick={() => {
                setLastChannel("whatsapp");
                void whatsapp.run();
              }}
            >
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
      {succeeded && <p className="text-xs font-normal text-success">{succeeded}</p>}
    </div>
  );
}
