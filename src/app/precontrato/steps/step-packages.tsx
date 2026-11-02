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
import type { PublicCategory, PublicOrderLine, PublicPackage } from "../types";

interface StepPackagesProps {
  categories: PublicCategory[];
  orderLines: PublicOrderLine[];
  onAdd: (packageId: string) => void;
  onRemove: (packageId: string) => void;
  onSetQuantity: (packageId: string, quantity: number) => void;
  onNext: () => void;
}

const ALL = "todas";

// Public equivalent of the internal wizard's step-packages.tsx (spec §8.1).
// There is no price-list step before this one — the catalog is already
// scoped server-side (page.tsx) to the single list marked "pública", so
// every package here has exactly one price, never a map keyed by list id.
export function StepPackages({
  categories,
  orderLines,
  onAdd,
  onRemove,
  onSetQuantity,
  onNext,
}: StepPackagesProps) {
  const [categoryId, setCategoryId] = useState(ALL);

  const lineByPackageId = useMemo(
    () => new Map(orderLines.map((line) => [line.packageId, line])),
    [orderLines]
  );

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
  // label.
  const categoryItems = {
    [ALL]: "Todas las categorías",
    ...Object.fromEntries(categories.map((category) => [category.id, category.name])),
  };

  const selectedCount = orderLines.length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Elija sus paquetes</CardTitle>
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
              title="Ningún paquete disponible por el momento."
              description="Comuníquese con nosotros directamente para armar su pedido."
            />
          ) : filtered.length === 0 ? (
            <EmptyState icon={ListFilter} title="Ningún paquete en esta categoría." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
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
        {/* No "Atrás" here — this is the first step of the public flow;
            there is no price-list step before it (spec §8.1 fixes the
            catalog to the single "pública" list, chosen server-side). */}
        <span />
        <Button type="button" disabled={orderLines.length === 0} onClick={onNext}>
          Continuar
        </Button>
      </WizardStepFooter>
    </div>
  );
}

interface PackageCardProps {
  pkg: PublicPackage;
  line: PublicOrderLine | null;
  onAdd: () => void;
  onRemove: () => void;
  onSetQuantity: (quantity: number) => void;
}

function PackageCard({ pkg, line, onAdd, onRemove, onSetQuantity }: PackageCardProps) {
  const inOrder = line != null;
  const checkboxId = `package-${pkg.id}`;

  return (
    <Card className={cn("h-full", inOrder && "ring-2 ring-foreground")}>
      <CardHeader>
        <CardTitle>{pkg.name}</CardTitle>
        {pkg.description && <CardDescription>{pkg.description}</CardDescription>}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Money amount={pkg.price} className="font-heading text-lg font-semibold" />

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{pkg.categoryName}</Badge>
          {pkg.services.map((service) => (
            <Badge key={service.id} variant="outline">
              {service.name}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={checkboxId} className="font-normal">
          <Checkbox
            id={checkboxId}
            checked={inOrder}
            onCheckedChange={(checked) => (checked === true ? onAdd() : onRemove())}
          />
          {inOrder ? "En su pedido" : "Agregar"}
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
