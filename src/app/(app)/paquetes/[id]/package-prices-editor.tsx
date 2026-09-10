"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
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

import { savePackagePrice } from "../actions";

interface PriceListRow {
  id: string;
  name: string;
  isDefault: boolean;
  price: number | null;
}

interface PackagePricesEditorProps {
  packageId: string;
  priceLists: PriceListRow[];
}

function PriceRow({
  packageId,
  priceList,
}: {
  packageId: string;
  priceList: PriceListRow;
}) {
  const [value, setValue] = useState(
    priceList.price != null ? String(priceList.price) : ""
  );
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
        packageId,
        priceList.id,
        trimmed === "" ? null : Number(trimmed)
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2">
          {priceList.name}
          {priceList.isDefault && <Badge variant="info">Predeterminada</Badge>}
        </span>
      </TableCell>
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
          aria-label={`Precio en ${priceList.name}`}
        />
        {error && (
          <p role="alert" className="mt-1 text-sm font-normal text-destructive">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="mt-1 text-sm font-normal text-success-fg">
            Guardado.
          </p>
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

export function PackagePricesEditor({
  packageId,
  priceLists,
}: PackagePricesEditorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Precios por lista</CardTitle>
        <CardDescription>
          El precio de cada lista es independiente. Una lista sin precio
          asignado aparece vacía — no se copia ni se asume ningún valor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {priceLists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna lista de precios registrada todavía.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lista de precios</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceLists.map((priceList) => (
                  <PriceRow
                    key={priceList.id}
                    packageId={packageId}
                    priceList={priceList}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
