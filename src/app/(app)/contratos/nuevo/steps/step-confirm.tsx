"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Progress } from "@/components/ui/progress";
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

import { WizardStepFooter } from "./wizard-step-footer";
import type { QuotedLine } from "../types";

interface StepConfirmProps {
  quotedLines: QuotedLine[];
  subtotal: number;
  discount: number | null;
  extraCharge: number | null;
  deposit: number;
  total: number;
  balance: number;
  onDiscountChange: (value: number | null) => void;
  onExtraChargeChange: (value: number | null) => void;
  /** `null` hands the deposit back to the threshold rule — clearing the field
   * must not pin the override at 0. */
  onDepositChange: (value: number | null) => void;
  submitError: string | null;
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

const DEPOSIT_PRESETS: { label: string; fraction: number }[] = [
  { label: "30%", fraction: 0.3 },
  { label: "50%", fraction: 0.5 },
  { label: "Liquidar", fraction: 1 },
];

function parseOptionalAmount(raw: string): number | null {
  if (raw.trim() === "") {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// Spec §8 step 5 / sprint-04 task 5: the subtotal is derived from the order
// (computed by the parent wizard, passed in as a prop); the deposit starts
// as the legacy threshold-rule default (also computed by the parent — see
// `calculateDefaultDeposit` in src/lib/deposit.ts) and can be overridden
// here, same as discount and extra charge. Every amount stays fully
// controlled by the parent so total/balance recompute on every keystroke,
// with no server round-trip.
export function StepConfirm({
  quotedLines,
  subtotal,
  discount,
  extraCharge,
  deposit,
  total,
  balance,
  onDiscountChange,
  onExtraChargeChange,
  onDepositChange,
  submitError,
  isSubmitting,
  onBack,
  onConfirm,
}: StepConfirmProps) {
  // Seeded from the incoming values so that Atrás → Continuar returns to this
  // step with the adjustments the user had already opened still open.
  const [showDiscount, setShowDiscount] = useState(discount != null);
  const [showExtraCharge, setShowExtraCharge] = useState(extraCharge != null);

  // The `MoneyInput`s are text-first: the raw string is what the user typed,
  // the parent keeps the parsed number. They are separate on purpose — "" and
  // "0" both parse to a falsy value but mean completely different things.
  const [discountRaw, setDiscountRaw] = useState(discount != null ? String(discount) : "");
  const [extraChargeRaw, setExtraChargeRaw] = useState(
    extraCharge != null ? String(extraCharge) : ""
  );
  // `null` means "no manual edit yet" — the field keeps mirroring the
  // parent's rule-computed deposit as the total changes. The first keystroke
  // or preset click pins it.
  const [depositRaw, setDepositRaw] = useState<string | null>(null);

  function applyDiscountRaw(raw: string) {
    setDiscountRaw(raw);
    onDiscountChange(parseOptionalAmount(raw));
  }

  function applyExtraChargeRaw(raw: string) {
    setExtraChargeRaw(raw);
    onExtraChargeChange(parseOptionalAmount(raw));
  }

  function applyDepositRaw(raw: string) {
    setDepositRaw(raw);
    onDepositChange(parseOptionalAmount(raw));
  }

  function toggleDiscount(checked: boolean) {
    setShowDiscount(checked);
    if (!checked) {
      // Unchecking must clear the value, not merely hide it — otherwise a
      // hidden amount would still ride along in the `createContract` payload.
      setDiscountRaw("");
      onDiscountChange(null);
    }
  }

  function toggleExtraCharge(checked: boolean) {
    setShowExtraCharge(checked);
    if (!checked) {
      setExtraChargeRaw("");
      onExtraChargeChange(null);
    }
  }

  // Gate on `== null`, NEVER on `!value`: a deliberate 0 is a complete,
  // valid amount and must not block the submit. Only an active checkbox over
  // an empty (or unparseable) field is "incomplete".
  const discountIncomplete = showDiscount && discount == null;
  const extraChargeIncomplete = showExtraCharge && extraCharge == null;
  const hasIncompleteAdjustment = discountIncomplete || extraChargeIncomplete;

  const depositDisplay = depositRaw ?? String(deposit);
  const depositOverTotal = deposit > total;
  const isPaidInFull = total > 0 && deposit >= total;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Servicios cotizados</CardTitle>
          <CardDescription>
            Un renglón por paquete del pedido, con el código de catálogo y el
            precio de la lista elegida en el paso 1.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Paquete</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">P. unitario</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotedLines.map((line) => (
                <TableRow key={line.packageId}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {line.code}
                  </TableCell>
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
                <TableCell colSpan={4}>Subtotal</TableCell>
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
          <CardTitle>Ajustes</CardTitle>
          <CardDescription>
            El descuento y el cargo extra son opcionales — actívelos solo si
            este contrato los lleva.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="showDiscount" className="font-normal">
                <Checkbox
                  id="showDiscount"
                  checked={showDiscount}
                  onCheckedChange={(checked) => toggleDiscount(checked === true)}
                />
                Aplicar descuento
              </Label>
              {showDiscount && (
                <Field data-invalid={discountIncomplete}>
                  <FieldLabel htmlFor="discount">Descuento</FieldLabel>
                  <MoneyInput
                    id="discount"
                    value={discountRaw}
                    onChange={applyDiscountRaw}
                    placeholder="0.00"
                  />
                </Field>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="showExtraCharge" className="font-normal">
                <Checkbox
                  id="showExtraCharge"
                  checked={showExtraCharge}
                  onCheckedChange={(checked) => toggleExtraCharge(checked === true)}
                />
                Aplicar cargo extra
              </Label>
              {showExtraCharge && (
                <Field data-invalid={extraChargeIncomplete}>
                  <FieldLabel htmlFor="extraCharge">Cargo extra</FieldLabel>
                  <MoneyInput
                    id="extraCharge"
                    value={extraChargeRaw}
                    onChange={applyExtraChargeRaw}
                    placeholder="0.00"
                  />
                </Field>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4 text-sm font-semibold">
            <span>Total</span>
            <Money amount={total} className="font-heading text-lg" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anticipo</CardTitle>
          <CardDescription>
            El sistema propone el anticipo según la regla vigente. Puede
            escribir otro monto o usar un atajo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="deposit">Monto del anticipo</FieldLabel>
            <MoneyInput id="deposit" value={depositDisplay} onChange={applyDepositRaw} />
          </Field>

          {/* One-shot fills, NOT a persistent selection: they preload the
              input and nothing more, so there is no "which preset is active"
              state to track and no pressed/selected styling to keep in sync
              after the user edits the amount by hand. */}
          <div className="flex flex-wrap gap-2">
            {DEPOSIT_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                disabled={total <= 0}
                onClick={() => applyDepositRaw(String(roundToCents(total * preset.fraction)))}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {/* Clamped into [0, total]: a discount larger than the subtotal
                makes `total` negative, and a negative `value` or a `max` of
                0 would make the Base UI track render nonsense. */}
            <Progress
              tone="auto"
              value={Math.max(0, Math.min(deposit, total))}
              max={total > 0 ? total : 1}
            />
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Saldo</span>
              <Money amount={balance} className="font-heading text-lg" />
            </div>
          </div>
        </CardContent>
      </Card>

      {hasIncompleteAdjustment && (
        <Alert
          tone="warning"
          icon={CircleAlert}
          title="Falta el monto de un ajuste activo."
          description={
            discountIncomplete && extraChargeIncomplete
              ? "El descuento y el cargo extra están activos pero sin monto. Escriba ambos montos o desactive los ajustes que no apliquen."
              : discountIncomplete
                ? "El descuento está activo pero sin monto. Escriba el monto o desactive el descuento."
                : "El cargo extra está activo pero sin monto. Escriba el monto o desactive el cargo extra."
          }
        />
      )}

      {depositOverTotal && (
        <Alert
          tone="warning"
          icon={AlertTriangle}
          title="El anticipo supera el total del contrato."
          description="La regla de anticipo vigente propone un monto fijo que puede quedar por encima de totales bajos. Ajuste el anticipo si no es lo que corresponde cobrar."
        />
      )}

      {isPaidInFull && !depositOverTotal && (
        <Alert
          tone="success"
          icon={CheckCircle2}
          title="El contrato queda liquidado al firmar."
          description="El anticipo cubre el total y el saldo queda en cero. Verifique el monto antes de confirmar."
        />
      )}

      {submitError && (
        <Alert
          tone="danger"
          icon={CircleAlert}
          title="No se pudo crear el contrato."
          description={submitError}
        />
      )}

      <WizardStepFooter>
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onBack}>
          Atrás
        </Button>
        <Button
          type="button"
          disabled={isSubmitting || hasIncompleteAdjustment}
          onClick={onConfirm}
        >
          {isSubmitting ? "Creando…" : "Crear contrato"}
        </Button>
      </WizardStepFooter>
    </div>
  );
}

// Presets are a percentage of a peso total, so they can land on fractions of
// a cent (30% of 1,333.33). Rounded here rather than inside `MoneyInput`,
// which is deliberately format-only and never mutates the raw value.
function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
