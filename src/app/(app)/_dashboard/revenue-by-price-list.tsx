import { ChartColumn } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/money";
import { chartTokenVar } from "@/lib/event-type";
import type { RevenueSlice } from "@/lib/dashboard/dashboard-data";

/**
 * "Ingresos por lista de precios" — design-system §4's "chart of revenue by
 * price list", and the resolution of its §5.4 open decision (chart library,
 * deferred to this sprint).
 *
 * NO charting library. One ranked horizontal bar per price list, drawn with
 * two divs and a width percentage. The repo's precedent is already
 * hand-built visuals over a dependency (the calendar month grid, the
 * `Progress` collection bars), a single-series ranked bar needs no axes,
 * scales, tooltips or responsive container, and Recharts/visx would add a
 * client bundle to a page that is otherwise entirely server-rendered.
 *
 * Colours come from `var(--chart-N)` (§1.1), never from an interpolated
 * Tailwind class: Tailwind v4 only emits utilities whose class name appears
 * literally in the source, so `bg-${token}` silently produces no CSS. That
 * is exactly why `chartTokenVar` exists.
 */
export function RevenueByPriceList({ slices }: { slices: readonly RevenueSlice[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresos por lista de precios</CardTitle>
      </CardHeader>
      <CardContent className={slices.length === 0 ? "p-0" : undefined}>
        {slices.length === 0 ? (
          <EmptyState
            icon={ChartColumn}
            title="Todavía no hay pagos registrados."
            description="Al registrar el primer pago, aquí aparece el ingreso por lista de precios."
          />
        ) : (
          // A plain list, not a <table>: each row is one label + one bar +
          // one amount, and the bar is decorative (aria-hidden) because the
          // amount beside it already states the value for a screen reader.
          <ul className="flex flex-col gap-3">
            {slices.map((slice) => (
              <li key={slice.priceListId} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate" title={slice.priceListName}>
                  {slice.priceListName}
                </span>
                <span aria-hidden className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${slice.percentOfMax}%`,
                      backgroundColor: chartTokenVar(slice.chartToken),
                    }}
                  />
                </span>
                <Money amount={slice.collected} className="w-28 shrink-0 text-right" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
