import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Switch } from "@/components/ui/switch";

describe("Switch (spec Requirement 7)", () => {
  it("checked renders data-checked (not data-unchecked) and the accent on class", () => {
    const html = renderToStaticMarkup(<Switch checked readOnly />);
    expect(html).toContain('data-checked=""');
    expect(html).not.toContain('data-unchecked=""');
    expect(html).toContain("data-checked:bg-primary");
  });

  it("unchecked renders data-unchecked and the neutral off class", () => {
    const html = renderToStaticMarkup(<Switch checked={false} readOnly />);
    expect(html).toContain('data-unchecked=""');
    expect(html).not.toContain('data-checked=""');
  });
});
