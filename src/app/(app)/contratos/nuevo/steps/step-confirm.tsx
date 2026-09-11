"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Money } from "@/components/money";

interface StepConfirmProps {
  subtotal: number;
  discount: number | null;
  extraCharge: number | null;
  deposit: number;
  total: number;
  balance: number;
  onDiscountChange: (value: number | null) => void;
  onExtraChargeChange: (value: number | null) => void;
  onDepositChange: (value: number) => void;
  submitError: string | null;
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

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
// here, same as discount and extra charge. Every field is fully controlled
// by the parent so total/balance recompute on every keystroke, with no
// server round-trip.
export function StepConfirm({
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
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Montos</CardTitle>
          <CardDescription>
            El descuento y el cargo extra son opcionales. El anticipo propone
            el valor por defecto según la regla vigente — puede modificarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <Money amount={subtotal} className="font-semibold" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="discount">Descuento (opcional)</FieldLabel>
              <Input
                id="discount"
                inputMode="decimal"
                placeholder="0.00"
                value={discount ?? ""}
                onChange={(event) => onDiscountChange(parseOptionalAmount(event.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="extraCharge">Cargo extra (opcional)</FieldLabel>
              <Input
                id="extraCharge"
                inputMode="decimal"
                placeholder="0.00"
                value={extraCharge ?? ""}
                onChange={(event) => onExtraChargeChange(parseOptionalAmount(event.target.value))}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between border-t pt-4 text-sm font-semibold">
            <span>Total</span>
            <Money amount={total} className="text-lg" />
          </div>

          <Field>
            <FieldLabel htmlFor="deposit">Anticipo</FieldLabel>
            <Input
              id="deposit"
              inputMode="decimal"
              value={deposit}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                onDepositChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
              }}
            />
          </Field>

          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Saldo</span>
            <Money amount={balance} className="text-lg" />
          </div>
        </CardContent>
      </Card>

      {submitError && (
        <p role="alert" className="text-sm font-normal text-destructive">
          {submitError}
        </p>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={onConfirm}>
          {isSubmitting ? "Creando…" : "Crear contrato"}
        </Button>
      </div>
    </div>
  );
}
