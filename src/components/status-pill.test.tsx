import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusPill } from "@/components/status-pill";
import type { ContractStatus, PaymentStatus } from "@/generated/prisma/client";

// Hardcoded expected labels (not imported from the module under test) so this
// test actually locks in the real Spanish copy rather than trivially matching
// itself against a re-exported constant.
const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  confirmed: "Confirmado",
  pre_contract: "Pre-contrato",
  completed: "Completado",
  cancelled: "Cancelado",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid_in_full: "Pagado",
  deposit_paid: "Anticipo pagado",
  partial: "Pago parcial",
  pending: "Pendiente",
};

describe("StatusPill dot (spec Requirement 2)", () => {
  it("contrato branch renders dot styling and unchanged label", () => {
    const html = renderToStaticMarkup(<StatusPill kind="contrato" value="confirmed" />);
    expect(html).toContain('data-slot="badge-dot"');
    expect(html).toContain("Confirmado");
  });

  it("pago branch renders dot styling and unchanged label", () => {
    const html = renderToStaticMarkup(<StatusPill kind="pago" value="deposit_paid" />);
    expect(html).toContain('data-slot="badge-dot"');
    expect(html).toContain("Anticipo pagado");
  });

  it("all ContractStatus labels remain unchanged", () => {
    for (const [status, label] of Object.entries(CONTRACT_STATUS_LABEL) as [
      ContractStatus,
      string,
    ][]) {
      const html = renderToStaticMarkup(<StatusPill kind="contrato" value={status} />);
      expect(html).toContain(label);
    }
  });

  it("all PaymentStatus labels remain unchanged", () => {
    for (const [status, label] of Object.entries(PAYMENT_STATUS_LABEL) as [
      PaymentStatus,
      string,
    ][]) {
      const html = renderToStaticMarkup(<StatusPill kind="pago" value={status} />);
      expect(html).toContain(label);
    }
  });
});
