import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KpiCard } from "@/components/ui/kpi-card";

describe("KpiCard (spec Requirement 9)", () => {
  it("trend up renders a literal ▲ colored text-success, no svg", () => {
    const html = renderToStaticMarkup(
      <KpiCard
        label="Ingresos"
        value="$10,000"
        trend={{ direction: "up", label: "12% vs. mes anterior" }}
      />
    );
    expect(html).toContain("▲");
    expect(html).toContain("text-success");
    expect(html).not.toContain("<svg");
  });

  it("trend down renders ▼ colored text-danger", () => {
    const html = renderToStaticMarkup(
      <KpiCard label="Cancelaciones" value="2" trend={{ direction: "down", label: "vs. anterior" }} />
    );
    expect(html).toContain("▼");
    expect(html).toContain("text-danger");
  });

  it("context renders plain muted text with no arrow or color", () => {
    const html = renderToStaticMarkup(
      <KpiCard label="Contratos activos" value="8" context="Todos los estados" />
    );
    expect(html).toContain("Todos los estados");
    expect(html).toContain("text-muted-foreground");
    expect(html).not.toContain("▲");
    expect(html).not.toContain("▼");
    expect(html).not.toContain("text-success");
    expect(html).not.toContain("text-danger");
  });
});
