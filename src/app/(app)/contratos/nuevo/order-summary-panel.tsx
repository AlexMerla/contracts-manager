"use client";

import { ShoppingCart } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { Money } from "@/components/money";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";

import type { ContractDataFormValues } from "./schema";
import type { QuotedLine } from "./types";

interface OrderSummaryPanelProps {
  priceListName: string | null;
  lines: QuotedLine[];
  subtotal: number;
  discount: number | null;
  extraCharge: number | null;
  total: number;
  deposit: number;
  balance: number;
  /** `null` until step 4 has been submitted — the panel renders no
   * client/event block before that (spec scenario "Client/event data appears
   * only after step 4 is completed"). */
  contractData: ContractDataFormValues | null;
}

// Read-only, derived-state-only rail. It deliberately exposes NO handlers:
// every mutation stays in the step that owns it, so the panel can never
// become a second, competing source of truth for the order.
export function OrderSummaryPanel({
  priceListName,
  lines,
  subtotal,
  discount,
  extraCharge,
  total,
  deposit,
  balance,
  contractData,
}: OrderSummaryPanelProps) {
  return (
    <Card size="sm" className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle>Resumen del pedido</CardTitle>
        <CardDescription>
          {priceListName ? `Precios de ${priceListName}.` : "Seleccione una lista de precios."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {lines.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Ningún paquete agregado."
            description="Agregue paquetes en el paso 2 para ver el total."
            className="px-0 py-6"
          />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <li key={line.packageId} className="flex items-start justify-between gap-3 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{line.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {line.code}
                      {line.quantity > 1
                        ? ` · ${line.quantity} ${line.quantityUnit ?? ""}`.trimEnd()
                        : ""}
                    </span>
                  </span>
                  <Money amount={line.lineTotal} className="shrink-0" />
                </li>
              ))}
            </ul>

            <Separator />

            <SummaryRow label="Subtotal" amount={subtotal} />
            {discount != null && <SummaryRow label="Descuento" amount={-discount} tone="muted" />}
            {extraCharge != null && <SummaryRow label="Cargo extra" amount={extraCharge} tone="muted" />}

            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <Money amount={total} className="font-heading text-base" />
            </div>

            <Separator />

            <SummaryRow label="Anticipo" amount={deposit} />
            <SummaryRow label="Saldo" amount={balance} />
          </>
        )}

        {contractData && (
          <>
            <Separator />
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Contrato
              </p>
              <p className="truncate text-sm font-medium">{contractData.clientName}</p>
              <p className="truncate text-sm text-muted-foreground">
                {EVENT_TYPE_LABEL[contractData.eventType]}
                {contractData.eventDate ? ` · ${formatEventDate(contractData.eventDate)}` : ""}
              </p>
              {contractData.placeName && (
                <p className="truncate text-sm text-muted-foreground">{contractData.placeName}</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone?: "muted";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Money amount={amount} tone={tone} showSign={tone === "muted"} />
    </div>
  );
}

// The RHF field is a native `<input type="date">`, so its value is always an
// ISO `yyyy-mm-dd` string. Reformatted by hand to `dd/mm/aaaa`
// (docs/design-system.md §3) rather than through `Date`, which would shift
// the day by the browser's UTC offset.
function formatEventDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
}
