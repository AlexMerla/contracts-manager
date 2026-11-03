import type { ContractStatus, PaymentStatus } from "@/generated/prisma/client";

// edit-precontract (spec §5 editing rule / §8.2) — the pure, framework-free
// half of contract editing: who may be edited, and how an edit is described
// in its audit Note. Shared by the detail page ("Editar" button), the edit
// route (redirect) and `updateContract` (in-lock guard), so the UI and the
// data layer can never disagree on the rule.

export type ContractEditBlock = "closed" | "paid_in_full";

export const CONTRACT_EDIT_BLOCK_MESSAGE = {
  closed: "Este contrato está cerrado y no se puede editar.",
  paid_in_full: "Este contrato ya está liquidado y no se puede editar.",
} as const satisfies Record<ContractEditBlock, string>;

/** `null` = editable. Closed is checked first: a completed contract is
 * usually also paid in full, and "cerrado" is the truer reason. The event
 * date is deliberately irrelevant (past events stay editable). */
export function contractEditBlock(
  contractStatus: ContractStatus,
  paymentStatus: PaymentStatus
): ContractEditBlock | null {
  if (contractStatus !== "pre_contract" && contractStatus !== "confirmed") {
    return "closed";
  }
  if (paymentStatus === "paid_in_full") {
    return "paid_in_full";
  }
  return null;
}

/** Comparable, already-normalized view of everything an edit may change.
 * Money in integer cents (`null` = not set), dates as ISO strings. */
export interface EditableContractState {
  clientName: string;
  clientPhone: string | null;
  clientMobile: string | null;
  clientEmail: string | null;
  clientAddress: string | null;
  eventType: string;
  celebrated: string | null;
  eventDate: string;
  eventTime: string | null;
  placeName: string | null;
  placeAddress: string | null;
  /** packageId → quantity */
  lines: Record<string, number>;
  /** serviceId → selected option */
  selections: Record<string, string>;
  discountCents: number | null;
  extraChargeCents: number | null;
  depositCents: number;
}

type ScalarKey = Exclude<keyof EditableContractState, "lines" | "selections">;

// Order = the order labels appear in the Note (form order, amounts last).
const SCALAR_LABELS: [ScalarKey, string][] = [
  ["clientName", "nombre del cliente"],
  ["clientPhone", "teléfono"],
  ["clientMobile", "celular"],
  ["clientEmail", "correo"],
  ["clientAddress", "dirección del cliente"],
  ["eventType", "tipo de evento"],
  ["celebrated", "festejado(s)"],
  ["eventDate", "fecha del evento"],
  ["eventTime", "hora del evento"],
  ["placeName", "lugar"],
  ["placeAddress", "dirección del lugar"],
];

function sameKeys(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  return aKeys.length === Object.keys(b).length && aKeys.every((key) => key in b);
}

/**
 * es-MX labels of what changed, in a stable order. Empty array = no-op edit
 * (spec R11: no Note, no side effects).
 *  - "paquetes": a package was added or removed;
 *  - "cantidades": a package present before and after changed quantity;
 *  - "opciones de servicio": any required selection differs.
 */
export function describeContractEditChanges(
  before: EditableContractState,
  after: EditableContractState
): string[] {
  const changes = SCALAR_LABELS.filter(([key]) => before[key] !== after[key]).map(
    ([, label]) => label
  );

  if (!sameKeys(before.lines, after.lines)) {
    changes.push("paquetes");
  }
  const quantityChanged = Object.entries(after.lines).some(
    ([packageId, quantity]) => packageId in before.lines && before.lines[packageId] !== quantity
  );
  if (quantityChanged) {
    changes.push("cantidades");
  }

  const selectionsChanged =
    !sameKeys(before.selections, after.selections) ||
    Object.entries(after.selections).some(([serviceId, option]) => before.selections[serviceId] !== option);
  if (selectionsChanged) {
    changes.push("opciones de servicio");
  }

  if (before.discountCents !== after.discountCents) {
    changes.push("descuento");
  }
  if (before.extraChargeCents !== after.extraChargeCents) {
    changes.push("cargo extra");
  }
  if (before.depositCents !== after.depositCents) {
    changes.push("anticipo");
  }

  return changes;
}

/** Integer cents for a nullable money value (`Decimal`, number or null). */
export function toCentsOrNull(amount: { toString(): string } | number | null): number | null {
  return amount == null ? null : Math.round(Number(amount) * 100);
}
