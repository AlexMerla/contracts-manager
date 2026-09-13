"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PackageSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/money";

import { PackageRowActions } from "./package-row-actions";

export interface PackageCardRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  quantityLabel: string;
  active: boolean;
  contractCount: number;
  serviceNames: string[];
  price: number | null;
}

export interface PriceListOption {
  id: string;
  name: string;
  isDefault: boolean;
}

interface PackagesGridViewProps {
  packages: PackageCardRow[];
  categories: { id: string; name: string }[];
  priceLists: PriceListOption[];
  selectedPriceListId: string | null;
  selectedPriceListName: string | null;
}

const ALL = "todos";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "archivados", label: "Archivados" },
];

export function PackagesGridView({
  packages,
  categories,
  priceLists,
  selectedPriceListId,
  selectedPriceListName,
}: PackagesGridViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState(ALL);
  const [categoryId, setCategoryId] = useState(ALL);
  // Two states for search: `queryInput` is what the user sees (immediate),
  // `query` is what actually filters (debounced 300ms). No debounce utility
  // exists in the repo, so this is hand-rolled — same pattern as
  // contracts-list-view.tsx.
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput), 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // Counts come from the UNFILTERED array — a tab badge must show how many
  // packages are in that state, not how many survive the other filters.
  const counts = useMemo(() => {
    const base: Record<string, number> = { [ALL]: packages.length, activos: 0, archivados: 0 };
    for (const pkg of packages) {
      base[pkg.active ? "activos" : "archivados"] += 1;
    }
    return base;
  }, [packages]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return packages.filter((pkg) => {
      if (tab === "activos" && !pkg.active) return false;
      if (tab === "archivados" && pkg.active) return false;
      if (categoryId !== ALL && pkg.categoryId !== categoryId) return false;
      if (needle && !pkg.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [packages, tab, categoryId, query]);

  // "Precios según" changes which `packagePrices` row was fetched server-side
  // — it cannot be a client filter, so it navigates instead. Other existing
  // query params are preserved.
  function onPriceListChange(priceListId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lista", priceListId);
    router.push(`/paquetes?${params.toString()}`);
  }

  const priceListLabel = selectedPriceListName
    ? `PRECIO EN ${selectedPriceListName.toUpperCase()}`
    : "PRECIO";

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
      <TabsList>
        {STATUS_TABS.map((item) => (
          <TabsTab key={item.value} value={item.value} count={counts[item.value] ?? 0}>
            {item.label}
          </TabsTab>
        ))}
      </TabsList>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Buscar paquete…"
          aria-label="Buscar paquetes"
          className="w-64"
        />

        <Select value={categoryId} onValueChange={(value) => setCategoryId(String(value))}>
          <SelectTrigger className="w-48" aria-label="Categoría">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {priceLists.length > 0 && selectedPriceListId && (
          <Select value={selectedPriceListId} onValueChange={(value) => onPriceListChange(String(value))}>
            <SelectTrigger className="w-48" aria-label="Precios según">
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
        )}
      </div>

      <TabsPanel value={tab}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title={
              packages.length === 0
                ? "Ningún paquete registrado todavía."
                : "Ningún paquete coincide con los filtros."
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((pkg) => (
              <Card key={pkg.id}>
                <CardHeader>
                  <span className="font-mono text-xs text-muted-foreground">
                    {pkg.code}
                  </span>
                  <CardTitle>{pkg.name}</CardTitle>
                  {pkg.description && (
                    <CardDescription>{pkg.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{pkg.categoryName}</Badge>
                    <Badge variant={pkg.active ? "success" : "danger"} dot>
                      {pkg.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pkg.contractCount} contratos · {pkg.quantityLabel}
                  </p>
                  {pkg.serviceNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pkg.serviceNames.map((name) => (
                        <Badge key={name} variant="outline">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <PackageRowActions
                    pkg={{ id: pkg.id, name: pkg.name, active: pkg.active }}
                  />
                </CardContent>
                <CardFooter className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {priceListLabel}
                    </span>
                    <Money
                      amount={pkg.price}
                      emptyLabel="Sin precio en esta lista"
                      className="font-heading text-base font-semibold"
                    />
                  </div>
                  <Button size="sm" render={<Link href="/contratos/nuevo" />}>
                    Usar
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </TabsPanel>
    </Tabs>
  );
}
