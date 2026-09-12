import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button size regression guard (spec Requirement 5)", () => {
  it("bare Button with no size prop matches size: default exactly (h-8, no h-9 leak)", () => {
    const html = renderToStaticMarkup(<Button>Guardar</Button>);
    expect(html).toContain("h-8");
    expect(html).not.toContain("h-9");
  });

  it('size="lg" renders the h-9 class', () => {
    const html = renderToStaticMarkup(<Button size="lg">Nuevo</Button>);
    expect(html).toContain("h-9");
  });
});
