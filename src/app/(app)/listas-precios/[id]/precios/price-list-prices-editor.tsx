"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

// Cross-folder import, verbatim — no parallel validation/save logic here.
// Confirmed working end-to-end (real Next-Action POST changed the DB).
import { savePackagePrice } from "@/app/(app)/paquetes/actions";

export interface PackagePriceRow {
  packageId: string;
  packageName: string;
  categoryName: string;
  price: number | null;
}

interface PriceListPricesEditorProps {
  priceListId: string;
  packages: PackagePriceRow[];
}

function PriceRow({
  priceListId,
  pkg,
}: {
  priceListId: string;
  pkg: PackagePriceRow;
}) {
  const router = useRouter();
  const [value, setValue] = useState(pkg.price != null ? String(pkg.price) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    setSaved(false);

    const trimmed = value.trim();
    if (trimmed !== "" && !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      setError("Ingrese un precio válido, ej. 1500.00");
      return;
    }

    startTransition(async () => {
      const result = await savePackagePrice(
        pkg.packageId,
        priceListId,
        trimmed === "" ? null : Number(trimmed)
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      // D4: savePackagePrice only revalidates /paquetes/[id] — it predates
      // this route, so this page refreshes itself instead of the shared
      // action gaining a second revalidatePath call.
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell>{pkg.packageName}</TableCell>
      <TableCell>{pkg.categoryName}</TableCell>
      <TableCell>
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          inputMode="decimal"
          placeholder="Sin precio en esta lista"
          className="max-w-40"
          aria-label={`Precio de ${pkg.packageName}`}
        />
        {error && (
          <p role="alert" className="mt-1 text-sm font-normal text-destructive">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="mt-1 text-sm font-normal text-success-fg">Guardado.</p>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button type="button" size="sm" disabled={isPending} onClick={onSave}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function PriceListPricesEditor({
  priceListId,
  packages,
}: PriceListPricesEditorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Precios por paquete</CardTitle>
        <CardDescription>
          El precio de cada paquete en esta lista es independiente. Un
          paquete sin precio asignado aparece vacío — no se copia ni se
          asume ningún valor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ningún paquete registrado todavía.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paquete</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <PriceRow key={pkg.packageId} priceListId={priceListId} pkg={pkg} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
