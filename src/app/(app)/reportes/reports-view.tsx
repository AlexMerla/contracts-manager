"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Download, FileSearch, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";
import {
  ALL_OPTION,
  filterReportRows,
  reportFiltersToQueryString,
  summarizeByCreator,
  type ReportFilters,
  type ReportRow,
} from "@/lib/reports/report-row";

// dd/mm/aaaa per design-system §3 — explicitly NOT `dateStyle: "short"`,
// which renders a 2-digit year in es-MX. UTC because the underlying column
// is `@db.Date`.
const periodFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function formatPeriod(desde: string, hasta: string): string {
  if (!desde && !hasta) return "Todas las fechas.";
  const label = (iso: string) => periodFormatter.format(new Date(`${iso}T00:00:00Z`));
  if (desde && hasta) return `Del ${label(desde)} al ${label(hasta)}`;
  return desde ? `Desde el ${label(desde)}` : `Hasta el ${label(hasta)}`;
}

// Same formatter as the period subtitle — one row's Fecha cell must read
// identically to how the header describes the range it falls within.
function formatEventDate(eventDateIso: string): string {
  return periodFormatter.format(new Date(`${eventDateIso}T00:00:00Z`));
}

interface ReportsViewProps {
  rows: ReportRow[];
  userOptions: { id: string; name: string }[];
  priceListOptions: { id: string; name: string }[];
  showSummary: boolean;
  initialFilters: ReportFilters;
}

export function ReportsView({
  rows,
  userOptions,
  priceListOptions,
  showSummary,
  initialFilters,
}: ReportsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const resultsRef = useRef<HTMLDivElement>(null);

  const [desde, setDesde] = useState(initialFilters.desde);
  const [hasta, setHasta] = useState(initialFilters.hasta);
  const [listaPrecios, setListaPrecios] = useState(initialFilters.listaPrecios);
  const [usuario, setUsuario] = useState(initialFilters.usuario);
  const [tipoEvento, setTipoEvento] = useState(initialFilters.tipoEvento);
  // Two states for the client search: `clienteInput` is what the user sees
  // (immediate), `cliente` is what filters and hits the URL (debounced
  // 300ms). No debounce utility exists in the repo — hand-rolled, same as
  // contracts-list-view.tsx.
  const [clienteInput, setClienteInput] = useState(initialFilters.cliente);
  const [cliente, setCliente] = useState(initialFilters.cliente);

  useEffect(() => {
    const timer = setTimeout(() => setCliente(clienteInput), 300);
    return () => clearTimeout(timer);
  }, [clienteInput]);

  const filters: ReportFilters = useMemo(
    () => ({ desde, hasta, listaPrecios, usuario, tipoEvento, cliente }),
    [desde, hasta, listaPrecios, usuario, tipoEvento, cliente]
  );

  // ONE query string, feeding both the URL and the export link — the file
  // can never describe a different filter set than the screen.
  const queryString = useMemo(() => reportFiltersToQueryString(filters), [filters]);

  // `replace`, not `push` — filtering shouldn't fill the back-history.
  useEffect(() => {
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [queryString, pathname, router]);

  const filtered = useMemo(() => filterReportRows(rows, filters), [rows, filters]);
  const summary = useMemo(
    () => (showSummary ? summarizeByCreator(filtered) : []),
    [showSummary, filtered]
  );

  const exportHref = `/reportes/export${queryString ? `?${queryString}` : ""}`;

  // Still derived from the full (unfiltered) scoped row set — the same rule
  // contracts-list-view.tsx follows for its own dropdown options: a filter
  // control's choices never shrink just because another filter is active.
  const eventTypeOptions = useMemo(
    () => [...new Set(rows.map((row) => row.eventType))].sort((a, b) => a.localeCompare(b, "es-MX")),
    [rows]
  );

  const listaPreciosItems = {
    [ALL_OPTION]: "Todas las listas de precios",
    ...Object.fromEntries(priceListOptions.map((option) => [option.id, option.name])),
  };

  const usuarioItems = {
    [ALL_OPTION]: "Todos los usuarios",
    ...Object.fromEntries(userOptions.map((option) => [option.id, option.name])),
  };

  const tipoEventoItems = {
    [ALL_OPTION]: "Todos los tipos de evento",
    ...Object.fromEntries(eventTypeOptions.map((option) => [option, EVENT_TYPE_LABEL[option]])),
  };

  function focusResults() {
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle={formatPeriod(desde, hasta)}
        actions={
          // A plain <a>, NOT next/link: a download must be a real navigation,
          // not an RSC prefetch. No "Exportar a PDF" button — spec §9 says
          // PDF is not required, and a dead button breaks design-system §3.
          <Button size="lg" render={<a href={exportHref} />}>
            <Download />
            Exportar a Excel
          </Button>
        }
      />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-7 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <Input
                type="date"
                value={desde}
                onChange={(event) => setDesde(event.target.value)}
                aria-label="Desde"
                className="w-40"
              />
              <Input
                type="date"
                value={hasta}
                onChange={(event) => setHasta(event.target.value)}
                aria-label="Hasta"
                className="w-40"
              />

              <Select
                items={listaPreciosItems}
                value={listaPrecios}
                onValueChange={(value) => setListaPrecios(String(value))}
              >
                <SelectTrigger className="w-48" aria-label="Lista de precios">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>Todas las listas de precios</SelectItem>
                  {priceListOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                items={usuarioItems}
                value={usuario}
                onValueChange={(value) => setUsuario(String(value))}
              >
                <SelectTrigger className="w-48" aria-label="Usuario">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>Todos los usuarios</SelectItem>
                  {userOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                items={tipoEventoItems}
                value={tipoEvento}
                onValueChange={(value) => setTipoEvento(String(value))}
              >
                <SelectTrigger className="w-52" aria-label="Tipo de evento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>Todos los tipos de evento</SelectItem>
                  {eventTypeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {EVENT_TYPE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="search"
                value={clienteInput}
                onChange={(event) => setClienteInput(event.target.value)}
                placeholder="Cliente"
                aria-label="Cliente"
                className="w-56"
              />

              {/* Filters already apply live — this button just scrolls the
                  results into view, a real affordance rather than a lie. */}
              <Button type="button" size="lg" onClick={focusResults}>
                <Search />
                Generar reporte
              </Button>
            </div>
          </CardContent>
        </Card>

        {showSummary ? (
          <Card>
            <CardHeader>
              <CardTitle>Resumen por usuario creador</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead className="text-right">Contratos</TableHead>
                      <TableHead className="text-right">Cobrado</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map((entry) => (
                      <TableRow key={entry.createdById}>
                        <TableCell>{entry.createdByName}</TableCell>
                        <TableCell className="text-right">{entry.contractCount}</TableCell>
                        <TableCell className="text-right">
                          <Money amount={entry.collected} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money
                            amount={entry.balanceDue}
                            tone={entry.balanceDue > 0 ? "negative" : "muted"}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle ref={resultsRef}>Contratos del periodo</CardTitle>
            <CardAction>
              <Badge>{filtered.length} contratos</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Lista de precios</TableHead>
                    <TableHead>Creó</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Cobrado</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="p-0">
                        <EmptyState
                          icon={FileSearch}
                          title="Ningún contrato coincide con los filtros."
                          description="Ajuste los filtros o el periodo para ver más resultados."
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">
                        <Link href={`/contratos/${row.id}`} className="hover:underline">
                          {row.folio}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {/* Resolved Q6 — presentation only. The row is
                              still counted in "N contratos", still summed
                              into Cobrado/Saldo, and still exported: this
                              badge exists so a reader can SEE which rows are
                              inflating those figures, which was previously
                              invisible on this screen. `danger` is the fixed
                              tone for a cancelled contract (design-system
                              §2, same as `StatusPill kind="contrato"`). */}
                          <span className={row.isCancelled ? "text-muted-foreground" : undefined}>
                            {row.clientName}
                          </span>
                          {row.isCancelled && (
                            <Badge variant="danger" dot>
                              Cancelado
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{row.priceListName}</TableCell>
                      <TableCell>{row.createdByName}</TableCell>
                      <TableCell className="text-right">
                        <Money amount={row.total} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money amount={row.collected} />
                      </TableCell>
                      <TableCell>{formatEventDate(row.eventDateIso)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
