"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListFilter, MoreHorizontal, Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/money";

import { duplicatePriceList } from "./actions";
import { PriceListRowActions } from "./price-list-row-actions";

export interface PriceListSummary {
  id: string;
  code: string;
  name: string;
  contractCount: number;
  isDefault: boolean;
  active: boolean;
}

export interface PackageRateRow {
  id: string;
  code: string;
  packageName: string;
  categoryName: string;
  unitLabel: string;
  price: number | null;
  defaultPrice: number | null;
}

interface PriceListsMasterDetailProps {
  priceLists: PriceListSummary[];
  selected: PriceListSummary | null;
  rows: PackageRateRow[];
  catalogTotal: number | null;
}

export function PriceListsMasterDetail({
  priceLists,
  selected,
  rows,
  catalogTotal,
}: PriceListsMasterDetailProps) {
  const router = useRouter();
  const [isDuplicating, startDuplicating] = useTransition();
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Panel search is pure client-side (unlike `?lista=`, it changes nothing
  // the server queried) — deliberately not URL-synced.
  const [query, setQuery] = useState("");

  function onDuplicate(id: string) {
    setDuplicateError(null);
    startDuplicating(async () => {
      const result = await duplicatePriceList(id);
      if ("error" in result) {
        setDuplicateError(result.error);
        return;
      }
      router.push(`/listas-precios?lista=${result.id}`);
    });
  }

  const filteredPriceLists = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return priceLists;
    return priceLists.filter((priceList) =>
      priceList.name.toLowerCase().includes(needle)
    );
  }, [priceLists, query]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar lista…"
          aria-label="Buscar listas de precios"
        />

        {priceLists.length === 0 ? (
          <EmptyState icon={Tags} title="Ninguna lista de precios registrada todavía." />
        ) : filteredPriceLists.length === 0 ? (
          <EmptyState icon={ListFilter} title="Ninguna lista coincide con la búsqueda." />
        ) : (
          <div className="flex flex-col gap-2">
            {filteredPriceLists.map((priceList) => {
              const isSelected = priceList.id === selected?.id;
              return (
                <Link
                  key={priceList.id}
                  href={`/listas-precios?lista=${priceList.id}`}
                  scroll={false}
                  aria-current={isSelected}
                >
                  <Card
                    interactive
                    size="sm"
                    className={isSelected ? "ring-2 ring-foreground" : undefined}
                  >
                    <CardHeader className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle>{priceList.name}</CardTitle>
                        {priceList.isDefault && (
                          <Badge variant="info">Predeterminada</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {priceList.contractCount} contratos
                      </p>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {selected && (
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-base font-semibold">{selected.name}</h2>
              {catalogTotal != null && (
                <p className="text-sm text-muted-foreground">
                  Total configurado: <Money amount={catalogTotal} className="inline" />
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PriceListRowActions
                priceList={{
                  id: selected.id,
                  name: selected.name,
                  isDefault: selected.isDefault,
                  active: selected.active,
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" aria-label="Más acciones" />}
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={isDuplicating}
                    onClick={() => onDuplicate(selected.id)}
                  >
                    {isDuplicating ? "Duplicando…" : "Duplicar"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {duplicateError && (
          <p role="alert" className="text-sm font-normal text-destructive">
            {duplicateError}
          </p>
        )}

        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clave</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Vs. general</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Tags}
                      title="Ningún paquete registrado todavía."
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const isSelectedDefault = !!selected?.isDefault;
                const delta =
                  !isSelectedDefault && row.price != null && row.defaultPrice != null
                    ? row.price - row.defaultPrice
                    : null;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.code}</TableCell>
                    <TableCell>{row.packageName}</TableCell>
                    <TableCell>{row.categoryName}</TableCell>
                    <TableCell>{row.unitLabel}</TableCell>
                    <TableCell className="text-right">
                      <Money amount={row.price} emptyLabel="Sin precio en esta lista" />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* VS GENERAL is always neutral (tone="muted"), never
                          positive/negative — locked product decision, never
                          inferred from the delta's sign. */}
                      {isSelectedDefault ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Money amount={delta} tone="muted" showSign emptyLabel="—" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
