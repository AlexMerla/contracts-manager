import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

// spec Requirement 6. TabsPrimitive.Indicator is intentionally not wrapped
// (design §0.2 — it renders hidden="" in SSR since it measures layout
// client-side), so the active-state assertion below is on Tabs.Tab's own
// class, never on an indicator element (there isn't one in this DOM).
describe("Tabs primitive (spec Requirement 6)", () => {
  it("active tab's class includes an ink class and no accent-token class", () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTab value="a">Confirmado</TabsTab>
          <TabsTab value="b">Pendiente</TabsTab>
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b">Panel B</TabsPanel>
      </Tabs>
    );

    // Confirm no indicator element leaked into the SSR output.
    expect(html).not.toContain("data-slot=\"tabs-indicator\"");

    // Locate the active tab (data-active is present, Base UI emits it as a
    // bare boolean attribute: data-active="") and assert its class.
    const activeTabMatch = html.match(/<button[^>]*data-active=""[^>]*>/);
    expect(activeTabMatch).not.toBeNull();
    const activeTabHtml = activeTabMatch![0];
    expect(activeTabHtml).toContain("data-active:border-foreground");
    expect(activeTabHtml).not.toMatch(/data-active:border-(?:accent|primary)\b/);
  });

  it("count renders a Badge showing the number inside the tab", () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTab value="a" count={12}>
            Confirmado
          </TabsTab>
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
      </Tabs>
    );

    expect(html).toContain('data-slot="badge"');
    expect(html).toContain(">12<");
  });

  it("Base UI wires role/aria-selected/tabpanel attributes for controlled switching", () => {
    // No live-click harness exists in this environment (design §0.1's real
    // probe confirms this shape) — verified by reading Base UI's own
    // generated attributes for the controlled `value`.
    const htmlA = renderToStaticMarkup(
      <Tabs value="a">
        <TabsList>
          <TabsTab value="a">A</TabsTab>
          <TabsTab value="b">B</TabsTab>
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b">Panel B</TabsPanel>
      </Tabs>
    );
    expect(htmlA).toContain('role="tab"');
    expect(htmlA).toContain('role="tabpanel"');
    expect(htmlA).toContain("Panel A");

    const htmlB = renderToStaticMarkup(
      <Tabs value="b">
        <TabsList>
          <TabsTab value="a">A</TabsTab>
          <TabsTab value="b">B</TabsTab>
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b">Panel B</TabsPanel>
      </Tabs>
    );
    expect(htmlB).toContain("Panel B");
  });
});
