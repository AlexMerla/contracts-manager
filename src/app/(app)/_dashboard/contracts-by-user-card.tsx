import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import type { CreatorSummary } from "@/lib/reports/report-row";

/**
 * "Contratos por usuario" — `super`-only. Task 7 lists "contracts created
 * per user" as a required indicator; the mockup does not draw it, and the
 * user resolved that tie in favour of the task wording (2026-10-08), so this
 * block coexists with `/reportes`' "Resumen por usuario creador" rather than
 * replacing it.
 *
 * Same columns, same order, same `summarizeByCreator` implementation as that
 * block — with no filters applied, the two tables must agree row for row.
 *
 * The caller renders this only when `byCreator !== null`: for a `normal`
 * session the block is ABSENT from the tree, not hidden with CSS.
 */
export function ContractsByUserCard({ rows }: { rows: readonly CreatorSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contratos por usuario</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
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
            {rows.map((entry) => (
              <TableRow key={entry.createdById}>
                <TableCell>{entry.createdByName}</TableCell>
                <TableCell className="text-right tabular-nums">{entry.contractCount}</TableCell>
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
      </CardContent>
    </Card>
  );
}
