"use client";

import { Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

import { WizardStepFooter } from "./wizard-step-footer";
import type { CatalogPriceList } from "../types";

interface StepPriceListProps {
  priceLists: CatalogPriceList[];
  priceListId: string;
  onChange: (priceListId: string) => void;
  onNext: () => void;
}

// Spec §8 step 1 / sprint-04 task 1: client-side selection only, nothing is
// persisted here. Switching the list re-resolves every package's price for
// step 2 — the wizard recomputes `pricesByPriceListId[priceListId]`, this
// component never touches the database.
//
// The selector is a real radio group: a visually hidden `<input type="radio">`
// inside the `<label>` that wraps each card. A `<Card>` renders a `<div>`, so
// it cannot legally live inside a `<button role="radio">`; the hidden input
// keeps keyboard arrow-key navigation, form semantics and screen-reader
// announcements for free, with no roving-tabindex code to maintain.
export function StepPriceList({
  priceLists,
  priceListId,
  onChange,
  onNext,
}: StepPriceListProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Lista de precios</CardTitle>
          <CardDescription>
            Elija la lista de precios para este contrato. Los precios del paso
            siguiente se calculan según la lista seleccionada aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {priceLists.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="Ninguna lista de precios activa."
              description="Pida al Super Usuario que active una lista antes de crear el contrato."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {priceLists.map((priceList) => {
                const isSelected = priceList.id === priceListId;
                return (
                  <label key={priceList.id} className="block cursor-pointer">
                    <input
                      type="radio"
                      name="priceListId"
                      value={priceList.id}
                      checked={isSelected}
                      onChange={() => onChange(priceList.id)}
                      className="peer sr-only"
                    />
                    <Card
                      interactive
                      className={cn(
                        "h-full peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                        isSelected && "ring-2 ring-foreground"
                      )}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle>{priceList.name}</CardTitle>
                          {priceList.isDefault && <Badge variant="info">Predeterminada</Badge>}
                        </div>
                        <CardDescription>
                          {priceList.contractCount}{" "}
                          {priceList.contractCount === 1 ? "contrato" : "contratos"} con esta lista
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <WizardStepFooter>
        {/* Step 1 has no "Atrás" — the empty span keeps "Continuar" pinned
            to the right inside the shared footer's `justify-between`, same
            position it had as a lone button under `justify-end`. */}
        <span />
        <Button type="button" disabled={!priceListId} onClick={onNext}>
          Continuar
        </Button>
      </WizardStepFooter>
    </div>
  );
}
