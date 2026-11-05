import { Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { paymentReceiptDownloadPath } from "@/lib/app-url";
import { PAYMENT_CONCEPT_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/payments/labels";
import type { PaymentConcept, PaymentMethod } from "@/generated/prisma/client";

import { PaymentReceiptMenu } from "./payment-receipt-menu";

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
  /** payment-receipt: false only for a payment that predates receipts (no
   * snapshot) — it has nothing to download or send. */
  hasReceipt: boolean;
  receiptEmailSent: boolean;
  receiptWhatsappSent: boolean;
}

interface PaymentsTabProps {
  contractId: string;
  payments: PaymentRow[];
  /** Cancelled: nothing more reaches the client, so the resend items are
   * hidden (and refused server-side); the download stays. */
  isCancelled: boolean;
  hasEmail: boolean;
  hasMobile: boolean;
}

/** highlevel-whatsapp: "sent" means handed to the HighLevel workflow. */
const WHATSAPP_SENT_HELP = "Se entregó a HighLevel para su envío; la entrega final se confirma en ru42.";

/** "enviado" (success) vs "pendiente" (neutral, not warning: an unchecked
 * "Enviar comprobante" is a normal choice, not a failure to chase). */
function ReceiptChannelBadge({ label, sent, title }: { label: string; sent: boolean; title?: string }) {
  return (
    <Badge variant={sent ? "success" : "secondary"} dot title={title}>
      {label} {sent ? "enviado" : "pendiente"}
    </Badge>
  );
}

export function PaymentsTab({ contractId, payments, isCancelled, hasEmail, hasMobile }: PaymentsTabProps) {
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
            <TableHead>Comprobante</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
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
              <TableCell>
                {payment.hasReceipt ? (
                  <div className="flex flex-wrap gap-1.5">
                    <ReceiptChannelBadge label="Correo" sent={payment.receiptEmailSent} />
                    <ReceiptChannelBadge
                      label="WhatsApp"
                      sent={payment.receiptWhatsappSent}
                      title={payment.receiptWhatsappSent ? WHATSAPP_SENT_HELP : undefined}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Sin comprobante</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {payment.hasReceipt && (
                  <PaymentReceiptMenu
                    paymentId={payment.id}
                    downloadHref={paymentReceiptDownloadPath(contractId, payment.id)}
                    canResend={!isCancelled}
                    hasEmail={hasEmail}
                    hasMobile={hasMobile}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
