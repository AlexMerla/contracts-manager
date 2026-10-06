import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import { PAYMENT_CONCEPT_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/payments/labels";
import type { PaymentConcept, PaymentMethod } from "@/generated/prisma/client";

// `eventDate`/`eventTime` on the contract use `timeZone: "UTC"` to avoid a
// local-timezone shift (page.tsx's comment); `paymentDate` is the same
// `@db.Date` shape, so it gets the same treatment here.
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" });

export interface PaymentRow {
  id: string;
  folio: string;
  paymentDate: Date;
  concept: PaymentConcept;
  method: PaymentMethod;
  amount: number;
}

interface PaymentsTabProps {
  payments: PaymentRow[];
}

export function PaymentsTab({ payments }: PaymentsTabProps) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Todavía no hay pagos registrados"
        description="Los pagos que registre para este contrato aparecerán aquí."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Folio</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Concepto</TableHead>
            <TableHead>Método</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell className="font-medium">{payment.folio}</TableCell>
              <TableCell>{dateFormatter.format(payment.paymentDate)}</TableCell>
              <TableCell>{PAYMENT_CONCEPT_LABEL[payment.concept]}</TableCell>
              <TableCell>{PAYMENT_METHOD_LABEL[payment.method]}</TableCell>
              <TableCell className="text-right">
                <Money amount={payment.amount} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
