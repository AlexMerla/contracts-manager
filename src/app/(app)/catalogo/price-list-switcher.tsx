"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PriceListSwitcherProps {
  priceLists: { id: string; name: string; isDefault: boolean }[];
  selectedId: string;
}

// Read-only navigation control, not a mutation — changing the selection
// just re-renders the page with a different `?lista=` query param. No
// server action involved, so there's nothing here for a `normal` user to
// misuse (spec sprint-03 task 8).
export function PriceListSwitcher({
  priceLists,
  selectedId,
}: PriceListSwitcherProps) {
  const router = useRouter();

  const priceListItems = Object.fromEntries(
    priceLists.map((priceList) => [
      priceList.id,
      `${priceList.name}${priceList.isDefault ? " (predeterminada)" : ""}`,
    ])
  );

  return (
    <Select
      items={priceListItems}
      value={selectedId}
      onValueChange={(value) => {
        router.push(`/catalogo?lista=${value}`);
      }}
    >
      <SelectTrigger className="w-64">
        <SelectValue />
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
  );
}
