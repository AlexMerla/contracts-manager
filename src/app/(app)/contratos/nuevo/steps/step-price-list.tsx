"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
export function StepPriceList({
  priceLists,
  priceListId,
  onChange,
  onNext,
}: StepPriceListProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Elija la lista de precios para este contrato. Los precios del paso
        siguiente se calculan según la lista seleccionada aquí.
      </p>

      {priceLists.length === 0 ? (
        <p className="text-sm text-destructive">
          Ninguna lista de precios activa — no se puede crear un contrato
          todavía.
        </p>
      ) : (
        <Select value={priceListId} onValueChange={(value) => onChange(value ?? "")}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder="Seleccione una lista de precios" />
          </SelectTrigger>
          <SelectContent>
            {priceLists.map((priceList) => (
              <SelectItem key={priceList.id} value={priceList.id}>
                {priceList.name}
                {priceList.isDefault ? " (predeterminada)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex justify-end">
        <Button type="button" disabled={!priceListId} onClick={onNext}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
