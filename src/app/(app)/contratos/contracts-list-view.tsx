"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileSearch } from "lucide-react";

import type { ContractStatus, PaymentStatus } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
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
// Single source of truth for the payment vocabulary — re-exported from
// status-pill so the filter and the pill can never drift apart.
import { PAYMENT_STATUS_LABEL, StatusPill } from "@/components/status-pill";

export interface ContractRow {
  id: string;
  folio: string;
  clientName: string;
  eventType: string;
  eventDateLabel: string;
  contractStatus: ContractStatus;
  paymentStatus: PaymentStatus;
  balance: number;
  priceListId: string;
  priceListName: string;
  createdByName: string;
}

export interface ContractsFilters {
  estado: string;
  q: string;
  tipoEvento: string;
  listaPrecios: string;
  estatusPago: string;
}

const ALL = "todos";

// Tab order follows the contract lifecycle, not the enum's declaration order.
const STATUS_TABS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos" },
  { value: "pre_contract", label: "Pre-contrato" },
  { value: "confirmed", label: "Confirmados" },
  { value: "completed", label: "Completados" },
  { value: "cancelled", label: "Cancelados" },
];

interface ContractsListViewProps {
  contracts: ContractRow[];
  showCreatedBy: boolean;
  initialFilters: ContractsFilters;
}

export function ContractsListView({
  contracts,
  showCreatedBy,
  initialFilters,
}: ContractsListViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [estado, setEstado] = useState(initialFilters.estado);
  const [tipoEvento, setTipoEvento] = useState(initialFilters.tipoEvento);
  const [listaPrecios, setListaPrecios] = useState(initialFilters.listaPrecios);
  const [estatusPago, setEstatusPago] = useState(initialFilters.estatusPago);
  // Two states for search: `queryInput` is what the user sees (immediate),
  // `query` is what actually filters and hits the URL (debounced 300ms).
  // No debounce utility exists in the repo, so this is hand-rolled.
  const [queryInput, setQueryInput] = useState(initialFilters.q);
  const [query, setQuery] = useState(initialFilters.q);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput), 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // `replace`, not `push` — filtering shouldn't fill the back-history.
  // `scroll: false` keeps the viewport put. Same pattern as the catalog's
  // price-list-switcher.
  useEffect(() => {
    const params = new URLSearchParams();
    if (estado !== ALL) params.set("estado", estado);
    if (query.trim()) params.set("q", query.trim());
    if (tipoEvento !== ALL) params.set("tipoEvento", tipoEvento);
    if (listaPrecios !== ALL) params.set("listaPrecios", listaPrecios);
    if (estatusPago !== ALL) params.set("estatusPago", estatusPago);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [estado, query, tipoEvento, listaPrecios, estatusPago, pathname, router]);

  // Counts come from the UNFILTERED array — a tab badge must show how many
  // contracts are in that state, not how many survive the other filters.
  const counts = useMemo(() => {
    const base: Record<string, number> = { [ALL]: contracts.length };
    for (const contract of contracts) {
      base[contract.contractStatus] = (base[contract.contractStatus] ?? 0) + 1;
    }
    return base;
  }, [contracts]);

  // eventType is a free `String` in the Prisma schema, not an enum — the
  // options have to come from the real data.
  const eventTypeOptions = useMemo(
    () =>
      [...new Set(contracts.map((c) => c.eventType))].sort((a, b) =>
        a.localeCompare(b, "es-MX")
      ),
    [contracts]
  );

  const priceListOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const contract of contracts) {
      map.set(contract.priceListId, contract.priceListName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
  }, [contracts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contracts.filter((contract) => {
      if (estado !== ALL && contract.contractStatus !== estado) return false;
      if (tipoEvento !== ALL && contract.eventType !== tipoEvento) return false;
      if (listaPrecios !== ALL && contract.priceListId !== listaPrecios) return false;
      if (estatusPago !== ALL && contract.paymentStatus !== estatusPago) return false;
      if (
        needle &&
        !contract.folio.toLowerCase().includes(needle) &&
        !contract.clientName.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [contracts, estado, tipoEvento, listaPrecios, estatusPago, query]);

  // "Limpiar" resets the filter row but NOT the tab — the mockup treats the
  // active status tab and the filters as two separate concepts.
  const filtersDirty =
    queryInput !== "" || tipoEvento !== ALL || listaPrecios !== ALL || estatusPago !== ALL;

  function clearFilters() {
    setQueryInput("");
    setQuery("");
    setTipoEvento(ALL);
    setListaPrecios(ALL);
    setEstatusPago(ALL);
  }

  const columnCount = showCreatedBy ? 8 : 7;

  return (
    <Tabs value={estado} onValueChange={(value) => setEstado(String(value))}>
      <TabsList>
        {STATUS_TABS.map((tab) => (
          <TabsTab key={tab.value} value={tab.value} count={counts[tab.value] ?? 0}>
            {tab.label}
          </TabsTab>
        ))}
      </TabsList>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Buscar por folio o cliente…"
          aria-label="Buscar contratos"
          className="w-64"
        />

        <Select value={tipoEvento} onValueChange={(value) => setTipoEvento(String(value))}>
          <SelectTrigger className="w-48" aria-label="Tipo de evento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los eventos</SelectItem>
            {eventTypeOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={listaPrecios} onValueChange={(value) => setListaPrecios(String(value))}>
          <SelectTrigger className="w-48" aria-label="Lista de precios">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las listas</SelectItem>
            {priceListOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={estatusPago} onValueChange={(value) => setEstatusPago(String(value))}>
          <SelectTrigger className="w-48" aria-label="Estatus de pago">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los pagos</SelectItem>
            {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((status) => (
              <SelectItem key={status} value={status}>
                {PAYMENT_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtersDirty ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpiar
          </Button>
        ) : null}
      </div>

      <TabsPanel value={estado}>
        <div className="overflow-x-auto rounded-lg ring-1 shadow-sm ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                {showCreatedBy && <TableHead>Creado por</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columnCount} className="p-0">
                    <EmptyState
                      icon={FileSearch}
                      title="Ningún contrato coincide con los filtros."
                      description="Ajuste la búsqueda o limpie los filtros para ver más resultados."
                    />
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/contratos/${contract.id}`} className="hover:underline">
                      {contract.folio}
                    </Link>
                  </TableCell>
                  <TableCell>{contract.clientName}</TableCell>
                  <TableCell>{contract.eventType}</TableCell>
                  <TableCell>{contract.eventDateLabel}</TableCell>
                  <TableCell>
                    <StatusPill kind="contrato" value={contract.contractStatus} />
                  </TableCell>
                  <TableCell>
                    <StatusPill kind="pago" value={contract.paymentStatus} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money
                      amount={contract.balance}
                      tone={contract.balance > 0 ? "negative" : "muted"}
                    />
                  </TableCell>
                  {showCreatedBy && <TableCell>{contract.createdByName}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsPanel>
    </Tabs>
  );
}
