"use client";

import { useState } from "react";
import { ChevronDown, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { resendPaymentReceipt } from "./actions";

import type { ResendPaymentReceiptValues } from "./schema";

type Channel = ResendPaymentReceiptValues["channel"];

interface PaymentReceiptMenuProps {
  paymentId: string;
  /** Authenticated staff download (route re-checks session + ownership). */
  downloadHref: string;
  /** False once the contract is cancelled: nothing more reaches the client
   * (the action refuses it server-side too — this only hides the items). */
  canResend: boolean;
  hasEmail: boolean;
  hasMobile: boolean;
}

/**
 * payment-receipt R6/R7 — one "Comprobante" menu per payment row: download
 * (always, cancelled contracts included — it is the internal record) and
 * "Reenviar comprobante" › Por correo / Por WhatsApp, each gated on the
 * contact datum its channel needs, same rule as the contract's ResendMenu.
 */
export function PaymentReceiptMenu({
  paymentId,
  downloadHref,
  canResend,
  hasEmail,
  hasMobile,
}: PaymentReceiptMenuProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const showResend = canResend && (hasEmail || hasMobile);

  async function resend(channel: Channel) {
    setBusy(true);
    setError(null);
    setSent(false);
    const result = await resendPaymentReceipt({ paymentId, channel });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>
          <ReceiptText aria-hidden="true" />
          {busy ? "Enviando…" : "Comprobante"}
          <ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* A plain navigation: the route answers `Content-Disposition:
              attachment`, so the browser saves the file and stays here. */}
          <DropdownMenuItem
            onClick={() => {
              window.location.assign(downloadHref);
            }}
          >
            Descargar comprobante
          </DropdownMenuItem>
          {showResend && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Reenviar comprobante</DropdownMenuLabel>
                {hasEmail && (
                  <DropdownMenuItem disabled={busy} onClick={() => resend("email")}>
                    Por correo
                  </DropdownMenuItem>
                )}
                {hasMobile && (
                  <DropdownMenuItem disabled={busy} onClick={() => resend("whatsapp")}>
                    Por WhatsApp
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="max-w-64 text-right text-xs font-normal text-destructive">
          {error}
        </p>
      )}
      {sent && !error && <p className="text-xs font-normal text-success">Comprobante enviado.</p>}
    </div>
  );
}
