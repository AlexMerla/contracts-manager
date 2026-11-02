import { CalendarClock } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

// Rendered by page.tsx whenever the public flow has nothing to show: the
// `PUBLIC_PRECONTRACT_ENABLED` kill switch is off, or no `PriceList` is
// marked "pública" (@/lib/contracts/public-price-list's `getPublicPriceList`
// returned `null`). Both are real, expected states — not errors — so this is
// deliberately calm, concrete copy (docs/design-system.md §3: "concrete and
// numeric, never alarmist") rather than a dramatized failure message.
export function PrecontratoUnavailable() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 items-center justify-center px-6 py-16">
      <EmptyState
        icon={CalendarClock}
        title="En este momento no podemos recibir pedidos en línea."
        description="Comuníquese directamente con nosotros y con gusto le ayudamos a armar su pedido."
      />
    </div>
  );
}
