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
import type { ContractDataFormValues } from "@/lib/contracts/order-schemas";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";

import type { PublicQuotedLine } from "./types";

interface OrderSummaryPanelProps {
  priceListName: string;
  lines: PublicQuotedLine[];
  subtotal: number;
  total: number;
  deposit: number;
  balance: number;
  /** `null` until the data step has been submitted. */
  contractData: ContractDataFormValues | null;
}

// Public equivalent of the internal wizard's order-summary-panel.tsx —
// read-only, derived-state-only rail with no handlers of its own. No
// discount/extraCharge rows: those are always `null` on the public flow, so
// there is nothing to ever show here (unlike the internal panel, which
// conditionally renders them).
//
// Mobile-first per the design: on a phone (the overwhelming majority of
// public-cart traffic) this renders BELOW the step content in normal flow;
// `lg:sticky` only takes effect once the two-column layout kicks in.
export function OrderSummaryPanel({
  priceListName,
  lines,
  subtotal,
  total,
  deposit,
  balance,
  contractData,
}: OrderSummaryPanelProps) {
  return (
    <Card size="sm" className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle>Resumen de su pedido</CardTitle>
        <CardDescription>Precios de {priceListName}.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {lines.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Ningún paquete agregado."
            description="Agregue paquetes para ver el total."
            className="px-0 py-6"
          />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <li key={line.packageId} className="flex items-start justify-between gap-3 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{line.name}</span>
                    {line.quantity > 1 && (
                      <span className="text-xs text-muted-foreground">
                        {line.quantity} {line.quantityUnit ?? ""}
                      </span>
                    )}
                  </span>
                  <Money amount={line.lineTotal} className="shrink-0" />
                </li>
              ))}
            </ul>

            <Separator />

            <SummaryRow label="Subtotal" amount={subtotal} />

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
                Datos
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

function SummaryRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Money amount={amount} />
    </div>
  );
}

// Same hand-rolled reformat as the internal panel: the RHF field is a native
// `<input type="date">` (always ISO `yyyy-mm-dd`), reformatted to
// `dd/mm/aaaa` (docs/design-system.md §3) without going through `Date`,
// which would shift the day by the browser's UTC offset.
function formatEventDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
}
