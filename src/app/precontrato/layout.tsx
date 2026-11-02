// Minimal public shell for the FIRST unauthenticated route in this codebase
// that writes to the database. Deliberately bare — no `AppShell`, no
// sidebar, no `GoogleConnectionBanner`, no session read of any kind, unlike
// `src/app/(app)/layout.tsx`. Mirrors the isolation discipline of the other
// public surface, `src/app/contracts/view/[viewerToken]/page.tsx`, which
// also renders with no shared chrome.
//
// `src/proxy.ts` must list `PUBLIC_PRECONTRACT_PREFIX` in `PUBLIC_PREFIXES`
// — without that, the edge guard redirects every anonymous visitor to
// `/login` before this ever renders.
export default function PrecontratoLayout({ children }: LayoutProps<"/">) {
  return <div className="flex min-h-full flex-1 flex-col bg-background">{children}</div>;
}
