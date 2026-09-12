import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Alert } from "@/components/ui/alert";

describe("Alert (spec Requirement 10)", () => {
  it("each tone maps to its matching bg-*-bg/text-*-fg token pair", () => {
    const tones = ["info", "success", "warning", "danger"] as const;
    for (const tone of tones) {
      const html = renderToStaticMarkup(<Alert tone={tone} title="Título" />);
      expect(html).toContain(`bg-${tone}-bg`);
      expect(html).toContain(`text-${tone}-fg`);
    }
  });

  it("an action prop renders as a real button with the action's label", () => {
    const html = renderToStaticMarkup(
      <Alert
        tone="warning"
        title="Pago pendiente"
        description="El anticipo aún no se ha registrado."
        action={{ label: "Reintentar", onClick: () => {} }}
      />
    );
    expect(html).toContain("<button");
    expect(html).toContain("Reintentar");
  });
});
