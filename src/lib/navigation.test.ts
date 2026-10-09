import { describe, expect, it } from "vitest";

import { NAV_ITEMS, SUPER_ONLY_PREFIXES, navItemsForRole } from "@/lib/navigation";
import { NAV_ICONS } from "@/components/nav-icons";

describe("navigation", () => {
  it("SUPER_ONLY_PREFIXES matches the exact literal set (Sprint 3 + Sprint 6's /configuracion)", () => {
    expect(new Set(SUPER_ONLY_PREFIXES)).toEqual(
      new Set([
        "/usuarios",
        "/categorias",
        "/servicios",
        "/listas-precios",
        "/paquetes",
        "/configuracion",
      ])
    );
  });

  it("does not include '/' in SUPER_ONLY_PREFIXES (redirect-loop guard)", () => {
    expect(SUPER_ONLY_PREFIXES).not.toContain("/");
  });

  it("navItemsForRole('normal') returns only the shared items", () => {
    expect(navItemsForRole("normal").map((i) => i.href)).toEqual([
      "/",
      "/catalogo",
      "/contratos",
      "/calendario",
      "/reportes",
    ]);
  });

  it("navItemsForRole('super') returns all 11 items", () => {
    expect(navItemsForRole("super")).toHaveLength(11);
  });

  it("every NAV_ITEMS icon resolves in NAV_ICONS", () => {
    for (const item of NAV_ITEMS) {
      expect(NAV_ICONS[item.icon]).toBeDefined();
    }
  });
});
