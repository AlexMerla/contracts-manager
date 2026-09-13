"use client";

import { useMemo, useState } from "react";
import { Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

import { CategoryRowActions } from "./category-row-actions";

export interface CategoryRow {
  id: string;
  name: string;
  packageCount: number;
  serviceCount: number;
}

interface CategoriesListViewProps {
  categories: CategoryRow[];
}

// Pure client-side search — no `?q=` URL sync, unlike the paquetes/servicios
// filters that navigate. Nothing here changes what the server queried.
export function CategoriesListView({ categories }: CategoriesListViewProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((category) =>
      category.name.toLowerCase().includes(needle)
    );
  }, [categories, query]);

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar categoría…"
        aria-label="Buscar categorías"
        className="w-64"
      />

      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Paquetes</TableHead>
              <TableHead>Servicios</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  <EmptyState
                    icon={Tags}
                    title={
                      categories.length === 0
                        ? "Ninguna categoría registrada todavía."
                        : "Ninguna categoría coincide con la búsqueda."
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {filtered.map((category) => (
              <TableRow key={category.id}>
                <TableCell>{category.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{category.packageCount} paquetes</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{category.serviceCount} servicios</Badge>
                </TableCell>
                <TableCell>
                  <CategoryRowActions
                    category={{ id: category.id, name: category.name }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
