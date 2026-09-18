"use client";

import { useMemo, useState } from "react";
import { ListFilter, Minus, PackageSearch, Plus } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";

import { WizardStepFooter } from "./wizard-step-footer";
import type { CatalogCategory, CatalogPackage, OrderLine } from "../types";

interface StepPackagesProps {
  categories: CatalogCategory[];
  priceListId: string;
  orderLines: OrderLine[];
  onAdd: (packageId: string) => void;
  onRemove: (packageId: string) => void;
  onSetQuantity: (packageId: string, quantity: number) => void;
  onBack: () => void;
  onNext: () => void;
}

const ALL = "todas";

// Spec §8 step 2 / sprint-04 task 2: store-style catalog, packages addable to
// an in-progress order, bounded quantity selector for packages with
// `maxQuantity`. All client-side state — no database write happens until the
// wizard's final confirm step.
//
// The grid is FLAT (one grid over every package, category shown as a badge)
// rather than one grid per category heading: with the category filter below,
// per-category sections would be a second, redundant grouping of the same
// axis. The running order summary that used to live at the bottom of this
// step is gone — the wizard's persistent `OrderSummaryPanel` supersedes it.
export function StepPackages({
  categories,
  priceListId,
  orderLines,
  onAdd,
  onRemove,
  onSetQuantity,
  onBack,
  onNext,
}: StepPackagesProps) {
  const [categoryId, setCategoryId] = useState(ALL);

  const lineByPackageId = useMemo(
    () => new Map(orderLines.map((line) => [line.packageId, line])),
    [orderLines]
  );

  // `categories` arrives ALREADY filtered by page.tsx (categories with no
  // active package are dropped there). Re-filtering here — as this file used
  // to — duplicates that rule in a second place where it can silently drift.
  const allPackages = useMemo(
    () => categories.flatMap((category) => category.packages),
    [categories]
  );

  const filtered = useMemo(
    () =>
      categoryId === ALL
        ? allPackages
        : allPackages.filter((pkg) => pkg.categoryId === categoryId),
    [allPackages, categoryId]
  );

  // `items` is MANDATORY on every `Select` in this codebase: without it the
  // closed Base UI trigger renders the raw `value` (a uuid) instead of the
  // label. Recurring bug — do not drop it.
  const categoryItems = {
    [ALL]: "Todas las categorías",
    ...Object.fromEntries(categories.map((category) => [category.id, category.name])),
  };

  const selectedCount = orderLines.length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Paquetes del contrato</CardTitle>
          <CardDescription>Puede combinar más de un paquete.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select
              items={categoryItems}
              value={categoryId}
              onValueChange={(value) => setCategoryId(String(value))}
            >
              <SelectTrigger className="w-56" aria-label="Categoría">
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

            <p className="text-sm text-muted-foreground">
              {selectedCount} {selectedCount === 1 ? "seleccionado" : "seleccionados"}
            </p>
          </div>

          {allPackages.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Ningún paquete activo disponible."
              description="Pida al Super Usuario que active un paquete antes de armar el pedido."
            />
          ) : filtered.length === 0 ? (
            <EmptyState icon={ListFilter} title="Ningún paquete en esta categoría." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  priceListId={priceListId}
                  line={lineByPackageId.get(pkg.id) ?? null}
                  onAdd={() => onAdd(pkg.id)}
                  onRemove={() => onRemove(pkg.id)}
                  onSetQuantity={(quantity) => onSetQuantity(pkg.id, quantity)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WizardStepFooter>
        <Button type="button" variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" disabled={orderLines.length === 0} onClick={onNext}>
          Continuar
        </Button>
      </WizardStepFooter>
    </div>
  );
}

interface PackageCardProps {
  pkg: CatalogPackage;
  priceListId: string;
  line: OrderLine | null;
  onAdd: () => void;
  onRemove: () => void;
  onSetQuantity: (quantity: number) => void;
}

function PackageCard({ pkg, priceListId, line, onAdd, onRemove, onSetQuantity }: PackageCardProps) {
  const price = pkg.pricesByPriceListId[priceListId] ?? null;
  const inOrder = line != null;
  const checkboxId = `package-${pkg.id}`;

  return (
    <Card className={cn("h-full", inOrder && "ring-2 ring-foreground")}>
      <CardHeader>
        <span className="font-mono text-xs text-muted-foreground">{pkg.code}</span>
        <CardTitle>{pkg.name}</CardTitle>
        {pkg.description && <CardDescription>{pkg.description}</CardDescription>}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Money
          amount={price}
          emptyLabel="Sin precio en esta lista"
          className="font-heading text-lg font-semibold"
        />

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{pkg.categoryName}</Badge>
          {pkg.services.map((service) => (
            <Badge key={service.id} variant="outline">
              {service.name}
            </Badge>
          ))}
        </div>
      </CardContent>

      {/* Selection and quantity are ONE control row: the checkbox owns
          "is it in the order", the stepper (only for packages that have a
          `maxQuantity`) owns "how many". The old separate Agregar / Quitar
          del pedido buttons are gone. */}
      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={checkboxId} className="font-normal">
          <Checkbox
            id={checkboxId}
            checked={inOrder}
            disabled={price == null}
            onCheckedChange={(checked) => (checked === true ? onAdd() : onRemove())}
          />
          {inOrder ? "En el pedido" : "Agregar"}
        </Label>

        {inOrder && pkg.maxQuantity != null && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={line.quantity <= 1}
              onClick={() => onSetQuantity(line.quantity - 1)}
              aria-label={`Reducir cantidad de ${pkg.name}`}
            >
              <Icon icon={Minus} />
            </Button>
            <span className="min-w-16 text-center text-sm tabular-nums">
              {line.quantity} {pkg.quantityUnit ?? ""}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={line.quantity >= pkg.maxQuantity}
              onClick={() => onSetQuantity(line.quantity + 1)}
              aria-label={`Aumentar cantidad de ${pkg.name}`}
            >
              <Icon icon={Plus} />
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
