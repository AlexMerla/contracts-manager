export type UserRole = "super" | "normal";

export type NavIconName =
  | "LayoutDashboard"
  | "BookOpen"
  | "Tags"
  | "ConciergeBell"
  | "Package"
  | "ListOrdered"
  | "Users"
  | "FileText";

export type NavGroup = "Catálogo" | "Administración";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: NavIconName; // name, NOT a component — keeps lucide out of proxy.ts's bundle
  readonly group: NavGroup | null;
  readonly role: UserRole; // minimum role required to see AND to reach the route
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Inicio", icon: "LayoutDashboard", group: null, role: "normal" },
  { href: "/catalogo", label: "Catálogo", icon: "BookOpen", group: null, role: "normal" },
  { href: "/contratos", label: "Contratos", icon: "FileText", group: null, role: "normal" },
  { href: "/categorias", label: "Categorías", icon: "Tags", group: "Catálogo", role: "super" },
  { href: "/servicios", label: "Servicios", icon: "ConciergeBell", group: "Catálogo", role: "super" },
  { href: "/paquetes", label: "Paquetes", icon: "Package", group: "Catálogo", role: "super" },
  { href: "/listas-precios", label: "Listas de precios", icon: "ListOrdered", group: "Catálogo", role: "super" },
  { href: "/usuarios", label: "Usuarios", icon: "Users", group: "Administración", role: "super" },
] as const;

export const NAV_GROUP_ORDER: readonly (NavGroup | null)[] = [null, "Catálogo", "Administración"];

// Single source of truth consumed by src/proxy.ts. Derived, so nav visibility
// and route protection cannot drift apart.
export const SUPER_ONLY_PREFIXES: readonly string[] = NAV_ITEMS.filter(
  (item) => item.role === "super"
).map((item) => item.href);

export function navItemsForRole(role: UserRole): readonly NavItem[] {
  return role === "super" ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.role === "normal");
}
