"use client";

import { useMemo, useState } from "react";
import { ConciergeBell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

import { ServiceRowActions } from "./service-row-actions";

export interface ServiceRow {
  id: string;
  name: string;
  details: string | null;
  categoryId: string;
  categoryName: string;
  options: string[];
  packageCount: number;
}

interface ServicesListViewProps {
  services: ServiceRow[];
  categories: { id: string; name: string }[];
}

const ALL = "todos";

// Pure client-side search + category filter — no URL sync, mirroring
// categories-list-view.tsx. Nothing here changes what the server queried.
export function ServicesListView({ services, categories }: ServicesListViewProps) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(ALL);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return services.filter((service) => {
      if (categoryId !== ALL && service.categoryId !== categoryId) return false;
      if (needle && !service.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [services, query, categoryId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar servicio…"
          aria-label="Buscar servicios"
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
      </div>

      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Opciones</TableHead>
              <TableHead>Paquetes</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={ConciergeBell}
                    title={
                      services.length === 0
                        ? "Ningún servicio registrado todavía."
                        : "Ningún servicio coincide con los filtros."
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {filtered.map((service) => (
              <TableRow key={service.id}>
                <TableCell>{service.name}</TableCell>
                <TableCell>{service.categoryName}</TableCell>
                <TableCell>
                  {service.options.length > 0 ? (
                    <Badge variant="info" dot>
                      {service.options.length} opciones
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Sin opciones</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{service.packageCount} paquetes</Badge>
                </TableCell>
                <TableCell>
                  <ServiceRowActions
                    service={{
                      id: service.id,
                      name: service.name,
                      details: service.details,
                      categoryId: service.categoryId,
                      options: service.options,
                    }}
                    categories={categories}
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
