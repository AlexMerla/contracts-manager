"use client";

import { Minus, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/money";

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

// Spec §8 step 2 / sprint-04 task 2: store-style catalog grouped by
// category, packages addable to an in-progress order, bounded quantity
// selector for packages with `maxQuantity`. All client-side state — no
// database write happens until the wizard's final confirm step.
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
  const lineByPackageId = new Map(orderLines.map((line) => [line.packageId, line]));
  const categoriesWithPackages = categories.filter((category) => category.packages.length > 0);

  const summaryLines = orderLines
    .map((line) => {
      const pkg = categories
        .flatMap((category) => category.packages)
        .find((candidate) => candidate.id === line.packageId);
      if (!pkg) {
        return null;
      }
      const unitPrice = pkg.pricesByPriceListId[priceListId] ?? 0;
      return { pkg, line, unitPrice, lineTotal: unitPrice * line.quantity };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const subtotal = summaryLines.reduce((sum, entry) => sum + entry.lineTotal, 0);

  return (
    <div className="flex flex-col gap-6">
      {categoriesWithPackages.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ningún paquete activo disponible en esta lista de precios.
        </p>
      )}

      {categoriesWithPackages.map((category) => (
        <div key={category.id} className="flex flex-col gap-3">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {category.name}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {category.packages.map((pkg) => (
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
        </div>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Resumen del pedido</CardTitle>
          <CardDescription>
            {summaryLines.length === 0
              ? "Ningún paquete agregado todavía."
              : `${summaryLines.length} ${summaryLines.length === 1 ? "paquete" : "paquetes"} en el pedido.`}
          </CardDescription>
        </CardHeader>
        {summaryLines.length > 0 && (
          <CardContent className="flex flex-col gap-2">
            {summaryLines.map(({ pkg, line, lineTotal }) => (
              <div key={pkg.id} className="flex items-center justify-between text-sm">
                <span>
                  {pkg.name}
                  {pkg.maxQuantity ? ` × ${line.quantity}` : ""}
                </span>
                <Money amount={lineTotal} />
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-semibold">
              <span>Subtotal</span>
              <Money amount={subtotal} />
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" disabled={orderLines.length === 0} onClick={onNext}>
          Continuar
        </Button>
      </div>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{pkg.name}</CardTitle>
        {pkg.description && <CardDescription>{pkg.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Money
          amount={price}
          emptyLabel="Sin precio en esta lista"
          className="font-heading text-lg font-semibold"
        />

        {pkg.services.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pkg.services.map((service) => (
              <Badge key={service.id} variant="secondary">
                {service.name}
              </Badge>
            ))}
          </div>
        )}

        {!inOrder && (
          <Button type="button" size="sm" disabled={price == null} onClick={onAdd}>
            Agregar
          </Button>
        )}

        {inOrder && pkg.maxQuantity != null && (
          <div className="flex items-center gap-2">
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
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={onRemove}
              aria-label={`Quitar ${pkg.name} del pedido`}
            >
              <Icon icon={X} />
            </Button>
          </div>
        )}

        {inOrder && pkg.maxQuantity == null && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onRemove}>
            <Icon icon={X} />
            Quitar del pedido
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
