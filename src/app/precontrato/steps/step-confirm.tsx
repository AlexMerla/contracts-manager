"use client";

import { AlertTriangle, CircleAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableFooter,
} from "@/components/ui/table";
import { Money } from "@/components/money";

import { TurnstileWidget } from "../turnstile-widget";
import { WizardStepFooter } from "./wizard-step-footer";
import type { PublicQuotedLine } from "../types";

interface StepConfirmProps {
  quotedLines: PublicQuotedLine[];
  subtotal: number;
  deposit: number;
  total: number;
  balance: number;
  turnstileSiteKey: string;
  turnstileToken: string;
  onTurnstileToken: (token: string) => void;
  submitError: string | null;
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

// Public equivalent of the internal wizard's step-confirm.tsx — but amounts
// here are READ-ONLY (spec §8.1 / design): no `MoneyInput`, no 30%/50%/
// Liquidar presets. There is no staff present to override the proposed
// deposit on an anonymous submission, so the only numbers shown are exactly
// what the server will compute and write (`@/lib/deposit`'s threshold rule,
// `discount`/`extraCharge` always null). The deposit shown here is a
// PREVIEW only — `createPublicPreContract` always recomputes it itself and
// never trusts anything from this screen.
export function StepConfirm({
  quotedLines,
  subtotal,
  deposit,
  total,
  balance,
  turnstileSiteKey,
  turnstileToken,
  onTurnstileToken,
  submitError,
  isSubmitting,
  onBack,
  onConfirm,
}: StepConfirmProps) {
  // Mirrors the server's own pre-transaction refusal (public-precontract's
  // "deposit exceeds total" scenario) so the client sees the same verdict
  // before submitting — the server remains the authority either way.
  const depositOverTotal = deposit > total;
  const canConfirm = !isSubmitting && !depositOverTotal && turnstileToken.trim() !== "";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Su pedido</CardTitle>
          <CardDescription>Revise los paquetes y montos antes de confirmar.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paquete</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">P. unitario</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotedLines.map((line) => (
                <TableRow key={line.packageId}>
                  <TableCell className="whitespace-normal">{line.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.quantity} {line.quantityUnit ?? ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money amount={line.unitPrice} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money amount={line.lineTotal} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Subtotal</TableCell>
                <TableCell className="text-right">
                  <Money amount={subtotal} className="font-semibold" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anticipo</CardTitle>
          <CardDescription>
            El anticipo se calcula automáticamente según el monto de su
            pedido — no se realiza ningún cargo en este momento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total</span>
            <Money amount={total} className="font-heading text-lg" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Anticipo</span>
            <Money amount={deposit} />
          </div>
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Saldo</span>
            <Money amount={balance} className="font-heading text-base" />
          </div>
        </CardContent>
      </Card>

      {depositOverTotal && (
        <Alert
          tone="warning"
          icon={AlertTriangle}
          title="Su pedido requiere un anticipo mayor al total."
          description="Comuníquese con nosotros directamente para armar su contrato — no podemos confirmarlo en línea con este monto."
        />
      )}

      {!depositOverTotal && (
        <Card>
          <CardHeader>
            <CardTitle>Verificación de seguridad</CardTitle>
            <CardDescription>Confirme que es una persona para enviar su pedido.</CardDescription>
          </CardHeader>
          <CardContent>
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={onTurnstileToken} />
          </CardContent>
        </Card>
      )}

      {submitError && (
        <Alert
          tone="danger"
          icon={CircleAlert}
          title="No se pudo enviar su pedido."
          description={submitError}
        />
      )}

      <WizardStepFooter>
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" disabled={!canConfirm} onClick={onConfirm}>
          {isSubmitting ? "Enviando…" : "Confirmar pedido"}
        </Button>
      </WizardStepFooter>
    </div>
  );
}
