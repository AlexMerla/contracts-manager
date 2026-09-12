import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";

// First renderToStaticMarkup-based markup test in the repo (design §0.1
// confirmed real: works under this project's vitest `environment: "node"`,
// no jsdom needed since Base UI-wrapped/CVA components don't touch
// window/document at render time). Reference pattern for later UI tests:
// assert on data-*/class substrings, NEVER on Base UI's auto-generated `id`
// (uses useId, shifts run to run — not applicable to Badge, but the rule
// carries forward to Switch/Progress/Tabs).
describe("Badge dot", () => {
  it("renders a colored dot before the content when dot is set (spec Requirement 1)", () => {
    const html = renderToStaticMarkup(
      <Badge variant="success" dot>
        Confirmado
      </Badge>
    );

    expect(html).toContain('data-slot="badge-dot"');
    expect(html).toContain("bg-success");
    // The dot must precede the text content.
    expect(html.indexOf('data-slot="badge-dot"')).toBeLessThan(html.indexOf("Confirmado"));
  });

  it("renders byte-identical markup to today's output when dot is omitted", () => {
    const withDot = renderToStaticMarkup(<Badge variant="secondary">Normal</Badge>);
    const withoutDotFlag = renderToStaticMarkup(
      <Badge variant="secondary" dot={false}>
        Normal
      </Badge>
    );

    expect(withDot).not.toContain("badge-dot");
    expect(withDot).toBe(withoutDotFlag);
  });
});
