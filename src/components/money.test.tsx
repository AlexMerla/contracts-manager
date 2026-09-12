import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Money } from "@/components/money";

describe("Money tone (spec Requirement 3)", () => {
  it("tone=negative renders text-danger", () => {
    const html = renderToStaticMarkup(<Money amount={500} tone="negative" />);
    expect(html).toContain("text-danger");
  });

  it("tone=positive renders text-success", () => {
    const html = renderToStaticMarkup(<Money amount={500} tone="positive" />);
    expect(html).toContain("text-success");
  });

  it("tone=muted renders text-muted-foreground", () => {
    const html = renderToStaticMarkup(<Money amount={500} tone="muted" />);
    expect(html).toContain("text-muted-foreground");
  });

  it("no tone renders byte-identical to current output (only tabular-nums)", () => {
    const html = renderToStaticMarkup(<Money amount={500} />);
    expect(html).toBe('<span class="tabular-nums">$500.00</span>');
  });

  it("a positive amount with no tone is never auto-colored", () => {
    const html = renderToStaticMarkup(<Money amount={500} />);
    expect(html).not.toContain("text-success");
    expect(html).not.toContain("text-danger");
  });
});
