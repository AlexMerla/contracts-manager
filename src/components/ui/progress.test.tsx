import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Progress, resolveAutoTone } from "@/components/ui/progress";

// KNOWN SPEC/DESIGN DISCREPANCY (flagged for sdd-verify, do not "fix" here):
// spec Requirement 8's literal Given/When/Then text describes a 2-band split
// (accent for value 0/null, warning for any partial 0<value<max, success at
// or over max). The design's actual, typechecked-against-the-real-repo code
// implements a DIFFERENT 3-band split per docs/design-system.md §2's literal
// "amber -> indigo -> green (flat bands, not a gradient)" rule, at a 50%
// threshold: warning below 50%, accent from 50% up to (not including) 100%,
// success at/over 100%. Example of the conflict: resolveAutoTone(0, 100) is
// "accent" under the spec's literal text but "warning" under the shipped
// code. This test asserts against the shipped code's actual banding, per
// design deviation #3 — the design supersedes the stale spec text.
describe("resolveAutoTone (design's actual 3-band split, NOT spec's literal 2-band text)", () => {
  it("null value or max<=0 resolves warning", () => {
    expect(resolveAutoTone(null, 100)).toBe("warning");
    expect(resolveAutoTone(50, 0)).toBe("warning");
    expect(resolveAutoTone(50, -10)).toBe("warning");
  });

  it("values below 50% resolve warning", () => {
    expect(resolveAutoTone(0, 100)).toBe("warning");
    expect(resolveAutoTone(25, 100)).toBe("warning");
    expect(resolveAutoTone(49, 100)).toBe("warning");
  });

  it("values from 50% up to (not including) 100% resolve accent", () => {
    expect(resolveAutoTone(50, 100)).toBe("accent");
    expect(resolveAutoTone(75, 100)).toBe("accent");
    expect(resolveAutoTone(99, 100)).toBe("accent");
  });

  it("values at or over 100% resolve success", () => {
    expect(resolveAutoTone(100, 100)).toBe("success");
    expect(resolveAutoTone(150, 100)).toBe("success");
  });
});

describe("Progress rendering (spec Requirement 8's SSR scenario)", () => {
  it("renders width from value/max plus role=progressbar and aria-valuenow (Base UI defaults)", () => {
    const html = renderToStaticMarkup(<Progress value={40} max={100} />);
    expect(html).toContain("width:40%");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="40"');
  });
});
