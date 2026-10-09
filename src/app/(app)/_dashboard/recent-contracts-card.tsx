import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Money } from "@/components/money";
import { StatusPill } from "@/components/status-pill";
import type { DashboardContract } from "@/lib/dashboard/dashboard-data";

// dd/mm/aaaa per design-system §3 — explicitly NOT `dateStyle: "short"`,
// which renders a 2-digit year in es-MX. UTC because `eventDate` is
// `@db.Date`.
const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export function formatEventDate(eventDateIso: string): string {
  return dateFormatter.format(new Date(`${eventDateIso}T00:00:00Z`));
}

/**
 * The mockup prints folios as `CT-0412`. Real folios are a plain 5-digit
 * zero-padded number (`03142`) per design-system §3's 2026-09-19 correction
 * — "always display the folio verbatim as stored". The doc wins over the
 * mockup; do not reintroduce the prefix.
 */
export function RecentContractsCard({ rows }: { rows: readonly DashboardContract[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contratos recientes</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" render={<Link href="/contratos" />}>
            Ver todos
            <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha del evento</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={FileText}
                    title="Todavía no hay contratos."
                    description="Cree el primer contrato para verlo aquí."
                    action={
                      <Button size="sm" render={<Link href="/contratos/nuevo" />}>
                        Nuevo contrato
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-sm">
                  <Link href={`/contratos/${row.id}`} className="hover:underline">
                    {row.folio}
                  </Link>
                </TableCell>
                <TableCell>{row.clientName}</TableCell>
                <TableCell>{formatEventDate(row.eventDateIso)}</TableCell>
                <TableCell>
                  <StatusPill kind="pago" value={row.paymentStatus} />
                </TableCell>
                <TableCell className="text-right">
                  <Money amount={row.total} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
