import { Badge } from "@/components/ui/badge";
import type { ContractStatus, PaymentStatus } from "@/generated/prisma/client";

// Fixed status vocabulary → semantic color mapping per
// docs/design-system.md §1.1 — domain logic, must match the Prisma enums
// exactly, and the two vocabularies (`contrato` vs `pago`) must never be
// mixed in one instance.
const CONTRACT_STATUS_VARIANT: Record<ContractStatus, "success" | "info" | "danger"> = {
  confirmed: "success",
  pre_contract: "info",
  completed: "success",
  cancelled: "danger",
};

const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  confirmed: "Confirmado",
  pre_contract: "Pre-contrato",
  completed: "Completado",
  cancelled: "Cancelado",
};

const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, "success" | "warning" | "danger"> = {
  paid_in_full: "success",
  deposit_paid: "warning",
  partial: "warning",
  pending: "danger",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid_in_full: "Pagado",
  deposit_paid: "Anticipo pagado",
  partial: "Pago parcial",
  pending: "Pendiente",
};

type StatusPillProps =
  | { kind: "contrato"; value: ContractStatus }
  | { kind: "pago"; value: PaymentStatus };

export function StatusPill(props: StatusPillProps) {
  if (props.kind === "contrato") {
    return (
      <Badge variant={CONTRACT_STATUS_VARIANT[props.value]} dot>
        {CONTRACT_STATUS_LABEL[props.value]}
      </Badge>
    );
  }
  return (
    <Badge variant={PAYMENT_STATUS_VARIANT[props.value]} dot>
      {PAYMENT_STATUS_LABEL[props.value]}
    </Badge>
  );
}
