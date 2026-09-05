# UI design system — source of truth

**Purpose of this document:** encode the design intent from the Claude Design project **"Sistema de diseño de pagos"** (claude.ai/design, project id `81e6cdfa-ebd0-4831-88cb-efc2b6195d49`) as implementable rules for this codebase's real stack (Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui, per spec §3).

**This is documentation only.** No component, page, or Tailwind/shadcn config exists yet as a result of this document — it exists so that whichever sprint first touches UI (per spec §13's roadmap) builds against one consistent design, instead of improvising per screen. Do not scaffold components or theme files from this document alone; implement them when the sprint that needs them arrives.

**Do not copy the prototype's HTML/CSS/JSX verbatim.** The Claude Design project (`ui_kits/app/*.jsx`) is a static mockup with mock data and CDN-loaded fonts/icons — it demonstrates intent, not implementation. Reimplement the intent below using this project's real stack and conventions (Prisma enums, `es-MX` formatting, App Router, etc.).

If the source Claude Design project changes, re-sync this document before starting the next UI-touching sprint — do not silently drift.

---

## 1. Design tokens

### 1.1 Color

Two brand-adjacent hues plus a neutral scale. **Hard rule from the source system: brand color (`brand-*`, magenta) is never used as a background for data or status — only for the wordmark, links, and onboarding/marketing surfaces.** The action color (`accent-*`, indigo) is what drives buttons, focus rings, active nav, and toggles.

| Scale | Base | Range | Usage |
|---|---|---|---|
| `neutral` | `neutral-500`-ish mid-gray | `neutral-0` `#FFFFFF` → `neutral-900` `#191D28`, plus `ink` `#141720` | App chrome: surfaces, text, borders |
| `brand` | `brand-500` `#E22D89` | `brand-50` `#FDEBF4` → `brand-800` `#6E1141` | Wordmark, marketing/login accents only — never status or data |
| `accent` | `accent-500` `#5A5DE0` | `accent-50` `#EEEFFC` → `accent-800` `#2C2E7D` | Primary buttons, focus states, active nav, switches/checkboxes |

**Contrast warning carried over from the source system:** neither `brand-500` nor `accent-500` passes AA for text under 18px on white. Use `brand-600`/`brand-700` and `accent-700` for small text; reserve the `-500` steps for large text, icons, and fills.

**Semantic pairs** (each has a solid/bg/fg triplet):

| Semantic | Solid | Background | Foreground (text on bg) |
|---|---|---|---|
| `success` | `#17935C` | `#E6F5EE` | `#0F6E44` |
| `warning` | `#D98A0B` | `#FCF2DE` | `#8A5A08` |
| `danger` | `#D93B4B` | `#FCEAEC` | `#9E2532` |
| `info` | `#5A5DE0` | `#EDEEFC` | `#3B3DA6` |

**Status vocabulary → semantic mapping (fixed, do not vary by screen).** This mapping is domain logic, not styling preference — it must match the Prisma enums in spec §6 exactly:

| `ContractStatus` | Semantic | | `PaymentStatus` | Semantic |
|---|---|---|---|---|
| `confirmed` | success | | `paid_in_full` | success |
| `pre_contract` | info | | `deposit_paid` | warning |
| `completed` | success | | `partial` | warning |
| `cancelled` | danger | | `pending` | danger |

Destructive actions (delete, cancel) also use `danger`.

**Charts:** `chart-1`…`chart-8` in a fixed order (indigo, magenta, violet, teal, orange, sky, green, gray) plus `chart-grid`. The same index must mean the same series across every chart in the app — do not reassign per screen. Chart library choice is deferred to whichever sprint implements the Dashboard (spec §13 Sprint 8); when chosen, map its series colors to `chart-1..8`, don't invent a separate palette.

**Surfaces, text, borders:**
- `canvas` (page background) = `neutral-50`; `surface` (cards, inputs) = white.
- Text has 4 levels: `text` (primary), `text-secondary`, `text-muted`, `text-disabled`.
- Borders have 3 levels: `line`, `line-subtle`, `line-strong`.

**Dark mode:** the source system ("modo grafito") is a full custom-property override, not just an inverted neutral scale. When implementing, use `next-themes` and map "grafito" values to the `dark` variant of the Tailwind theme (see §5 — light/dark only, no density/accent-color user toggle for now).

### 1.2 Typography

Three type families, each with a distinct job:

| Family | Role | Used for |
|---|---|---|
| **Schibsted Grotesk** | UI body | Body text, labels, table content |
| **Geist** | Display | `h1`–`h4`, KPI values, large monetary amounts |
| **Roboto Mono** | Mono | Folios (`CT-0412`, `PG-0031`), IDs, audit/timestamp trails |

Load via `next/font/google` (not a CDN `@import` like the prototype) — this is a Vercel/Next.js convention already noted in the session's Vercel context.

- Scale: 10 steps, `2xs` (11px) → `5xl` (44px).
- Weights: 400 / 500 / 600 / 700.
- Tracking: `tight` (`-0.02em`, display), `snug` (`-0.01em`), `normal`, `wide` (`0.04em`), `caps` (`0.08em`, uppercase micro-labels — table headers, section eyebrows).
- Line-heights: `tight` 1.15, `snug` 1.35, `normal` 1.5, `relaxed` 1.65.
- **`font-variant-numeric: tabular-nums` applies globally to `body`**, not just to the `Money` component — every digit in the app aligns. Implement as a global CSS rule or Tailwind's `tabular-nums` applied at the root, not opt-in per component.

### 1.3 Spacing, radius, and layout

- Spacing scale: 4pt grid, `space-0` → `space-20` (80px).
- Border radius, tied to element type (not a free choice per component):

  | Token | Value | Applies to |
  |---|---|---|
  | `xs` | 4px | Checkboxes |
  | `sm` | 6px | Inputs, selects |
  | `md` | 10px | Buttons, alerts |
  | `lg` | 14px | Cards |
  | `xl` | 18px | Modals/dialogs |
  | `full` | 999px | Pills, avatars |

- Layout measurements: sidebar 236px (collapsed rail 64px), header 64px, page gutter 28px, `content-max` 1280px, `report-max` 960px (Reportes screen, tuned for print).
- **Table density is fixed "comfortable" by product decision**, not shadcn's default compact density: row height 56px, cell padding 14px/16px. Encode as Tailwind theme values, not ad-hoc arbitrary classes per table.

### 1.4 Elevation

5 shadow levels (`xs`/`sm`/`md`/`lg`/`xl`) over a blue-black base (`rgb(20 23 32 / α)`), not pure black. `focus-ring` = `0 0 0 3px rgb(90 93 224 / 0.22)` — uses the **accent** color, not a generic browser outline. `scrim` (modal backdrop) = dark overlay + `blur(4px)`.

### 1.5 Motion

Durations: `fast` 120ms, `base` 180ms, `slow` 280ms. Easing: `cubic-bezier(0.16, 1, 0.3, 1)` ("ease-out") for entrances, `ease-in-out` for continuous/looping motion. `prefers-reduced-motion` must disable all of the above globally — this is a hard accessibility requirement carried from the source system, not optional polish.

---

## 2. Component conventions

Base every component on shadcn/ui primitives where one exists; extend rather than replace. Three components are **domain components**, not visual-only — they encode business rules and must be built with the real Prisma enums, not left as generic UI:

| Component | Domain rule |
|---|---|
| `StatusPill` | Takes `kind: "contrato" \| "pago"` and a `ContractStatus`/`PaymentStatus` value; renders the fixed semantic mapping in §1.1. The two vocabularies must never be mixed in one component instance. |
| `Money` | Single source of truth for monetary formatting: `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`, tabular-nums, `$`/`−$`/`+$` sign prefixing. Do not call `Intl.NumberFormat` ad hoc elsewhere — this matches the existing rule in spec §7 for contract image generation, extended to on-screen rendering. |
| `Icon` | Thin wrapper around `lucide-react` (already a viable dependency choice — confirm the ~25 icon names used by the source kit exist in whatever version is installed at implementation time), fixed `strokeWidth={1.75}`. |

Other components, with what needs to be added beyond shadcn's defaults:

| Component | shadcn base | Extra needed |
|---|---|---|
| `Button` | `Button` | Add two variants beyond shadcn's default/secondary/destructive/outline/ghost/link: **`brand`** (magenta, marketing/login only — see §1.1's brand-color rule) and **`cobro`** (green, "registrar pago" domain action). Extend `buttonVariants` (cva), don't fork the component. |
| `Card` | `Card` | Add an `interactive` state (hover: elevate + slight `translateY`) — only for cards that are actually clickable; non-interactive cards must not move on hover. |
| `Badge` | `Badge` | Add `tone: ink` for "privileged role" (used for `Super Usuario` in the users table) alongside the standard neutral/success/warning/danger/info tones. |
| `Input` / `Select` / `Textarea` | shadcn form primitives | Focus state uses `accent-500` border + the accent `focus-ring` from §1.4. Decide at implementation time whether `Select` stays a styled native `<select>` (source system's choice) or adopts shadcn's Radix-based combobox — Radix is more accessible and consistent with the rest of shadcn, prefer it unless a specific screen needs native `<select>` behavior. |
| `Field` | shadcn `FormItem`/`FormLabel`/`FormMessage` | Direct mapping, no gap. |
| `Checkbox` / `Switch` | shadcn (Radix-based) | Visual restyle only (icon-based check mark) — shadcn's Radix logic is already correct, don't reimplement interaction. |
| `DataTable` | shadcn `Table` + `@tanstack/react-table` (or equivalent) | Sticky header, uppercase + `caps` tracking headers, fixed "comfortable" density (§1.3), zebra striping optional per screen, mandatory Spanish `emptyLabel` per table (e.g. "Ningún contrato coincide con los filtros."). The source prototype has no pagination/sorting — decide per screen at implementation time whether the real data volume needs it. |
| `KpiCard` | Custom (no direct shadcn equivalent) | `label`, `value` (can embed a `Money`), `delta` shown with unicode arrows (▲/▼), never icon glyphs for the delta itself. |
| `ProgressBar` | shadcn `Progress` | Add a `tone: "auto"` mode for collection-progress bars that steps through amber → indigo → green by percentage (flat color bands, not a gradient) — this is domain logic (payment collection status), not a generic loading bar. |
| `Alert` | shadcn `Alert` | Content rule, not a prop: every alert body must state cause + suggested action — never just a status statement. |
| `Dialog` | shadcn `Dialog` (Radix) | Radix's default overlay has no blur — add `backdrop-filter: blur(4px)` to match the `scrim` token (§1.4). Footer layout is fixed: cancel (ghost) on the left, primary action on the right. |
| `EmptyState` | Custom (no direct shadcn equivalent) | Lucide icon at 26px inside a `neutral-100` circle — never an illustration or emoji. |
| `PageHeader` | Custom (no shadcn equivalent) | Sticky top, 64px, `title`/`subtitle`/`breadcrumb`/`actions` — this is the per-screen header pattern used by every screen in the source kit; build once, reuse everywhere. |
| `SidebarNav` | Custom (no shadcn equivalent) | Fixed 236px, sections separated by group labels (source kit groups: unlabeled top-level, "Catálogo", "Administración"), numeric badges (e.g. pending payments count), footer user chip with role label. |
| `Tabs` | shadcn `Tabs` (Radix) | Underline uses `--ink`, not `--accent` — confirmed intentional in the source, not a bug; carry it over as-is. |

---

## 3. Content and voice rules

These apply to every piece of UI copy, equally binding as the visual tokens above:

- **Formal address ("usted"), never "tú"** — this refines spec §0's "product-facing text is in Spanish (Mexico)" with a specific register.
- Sentence case on buttons and labels; **UPPERCASE + `caps` tracking only for micro-labels** (table headers, section eyebrows) — never for buttons, titles, or body text.
- Dates: `dd/mm/aaaa`.
- Folios/IDs in the mono family (§1.2), with fixed prefixes: `CT-####` for contracts, `PG-####` for payments.
- No emoji, anywhere in product UI.
- Tone: concrete and numeric, never alarmist — this directly constrains how `Alert` and `EmptyState` copy should read (state the number/fact, then the action, not a dramatized warning).

---

## 4. Screen reference (for future sprints — not built yet)

This maps the source kit's screens to spec §13's roadmap, so whoever picks up each sprint knows which mockup to consult and which real tables it touches. **None of this is implemented; this table exists to save re-discovery time later.**

| Source kit screen | Spec §13 sprint | Real tables involved | Notes |
|---|---|---|---|
| `AppShell` | Cross-cutting (build once, first sprint that needs layout) | — | Sidebar nav structure: unlabeled top items, "Catálogo" group, "Administración" group; footer shows user name + role |
| `Login` | Sprint 2 (auth-roles) | `users` | Split layout: form left, feature bullets right |
| `Dashboard` | Sprint 8 | `contracts`, `payments`, `price_lists` | 4 KPIs, alert on near-event unpaid contracts, recent-contracts table, chart of revenue by price list |
| `Contratos` (list) | Sprint 4 (contract creation flow) or Sprint 8, whichever lands the contracts list UI first | `contracts` | Tabs by `contract_status` with counts, filters (search, event type, price list, payment status), table shows both status pills separately + computed balance |
| `ContratoDetalle` | Same as above | `contracts`, `contract_packages`, `payments`, `notes`, `google_connection` fields on `contracts` | Internal tabs (Resumen/Pagos/Notas/Historial); right column: balance card with `ProgressBar` + "Registrar pago" action, document/backup status card |
| `RegistrarPagoDialog` | Same as above | `payments` | Alert must state the business rule from spec §8: first payment moves `contract_status` to `confirmed` |
| `Pagos` (list) | Sprint 8 | `payments` | 3 KPIs (collected / outstanding / overdue), global payments table |
| `Calendario` | Sprint 6 (Google Master integration) | `contracts` (event_date, event_type), `calendar_event_id` | Custom month grid, events colored by `event_type` via `chart-N` |
| `Reportes` | Sprint 8 | `contracts`, `payments`, `users` | Width capped at `report-max` (960px) for print; per-user summary + period contracts table |
| `Configuracion` | Sprint 6 (Google connection) / Sprint 2 (users table) | `google_connection`, `users` | Google Master connection card must show `last_error` per spec §6.13; users table needs the `ink`-toned role badge for `super`; confirms spec §5's rule that the reconnect banner is visible to all roles but only actionable by `super` |

---

## 5. Open implementation decisions (resolve when the relevant sprint starts)

These are flagged, not resolved, so implementation doesn't stall rediscovering them:

1. **Theming scope**: light/dark only, via `next-themes` — the source system's density and accent-color "Tweaks" axes are explicitly **not** ported (confirmed decision, 2026-09-05). Do not build a theme-tweaks panel unless this decision is revisited.
2. **`Select` component**: native `<select>` restyle vs. shadcn's Radix combobox — decide per-screen if needed, default to Radix for consistency.
3. **DataTable pagination/sorting**: the source kit has neither. Decide based on real data volume when the first data-heavy table ships (`Contratos` or `Pagos`).
4. **Chart library**: deferred to the Dashboard sprint (Sprint 8). Whatever is chosen, map series colors to `chart-1..8` (§1.1) rather than the library's defaults.
5. **Icon audit**: confirm the ~25 Lucide icon names used by the source kit exist in whatever `lucide-react` version is installed when a screen is actually built (the version pinned during Sprint 1 was `^1.34.0` — re-check if it has since changed).

---

## Source provenance

- Claude Design project: **"Sistema de diseño de pagos"**, id `81e6cdfa-ebd0-4831-88cb-efc2b6195d49`.
- Reviewed and synthesized into this document: 2026-09-05.
- The prototype (`ui_kits/app/*.jsx`, `tokens/*.css`, `guidelines/*.html`) is the design *intent* source of truth. This markdown file is the *implementation rules* derived from it for this specific stack — when the two conflict, this file wins for anything stack-specific (font loading mechanism, component library choice, etc.); the source project wins for anything purely visual/tonal (colors, spacing, copy voice) that this file might have under-specified.
