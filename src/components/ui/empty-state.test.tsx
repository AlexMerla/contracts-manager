import { FileSearch } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/ui/empty-state";

describe("EmptyState (spec Requirement 11)", () => {
  it("renders the icon at size-[26px] inside a bg-muted circle, never an illustration/emoji", () => {
    const html = renderToStaticMarkup(<EmptyState icon={FileSearch} title="Sin resultados" />);
    expect(html).toContain("size-[26px]");
    expect(html).toContain("bg-muted");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });

  it("description and action are optional and render without error", () => {
    const withBoth = renderToStaticMarkup(
      <EmptyState
        icon={FileSearch}
        title="Sin resultados"
        description="Ajuste los filtros."
        action={<button>Limpiar</button>}
      />
    );
    expect(withBoth).toContain("Ajuste los filtros.");
    expect(withBoth).toContain("Limpiar");

    const withNeither = renderToStaticMarkup(<EmptyState icon={FileSearch} title="Sin resultados" />);
    expect(withNeither).toContain("Sin resultados");
  });
});
