# Project instructions for AI coding agents

This is the contract management system for "Todo con un Solo Proveedor" (event services: weddings, quinceañeras, graduations, etc.).

**Authoritative spec:** `docs/spec.md` — read the relevant sections before implementing anything. Do not invent behavior that isn't defined there; if something is ambiguous, ask rather than assume.

**Current sprint:** `specs/sprint-01-foundations/tasks.md` — work through the tasks in order, check them off (`- [x]`) as you complete them, and stop at each task's "Done when" criterion rather than continuing past it.

## Non-negotiable rules from the spec

- **Language:** all code and database identifiers are in English. Product-facing text (UI copy, generated contract content) is in Spanish (Mexico). See spec §0.
- **No job queue.** Background processing (image generation, Drive upload, Calendar event, email) is sequential and in-process, with retry via boolean status columns on `contracts` — not Redis, BullMQ, or any message broker. See spec §4.2.
- **Two separate Google OAuth flows.** User login (Auth.js) and the Google Master connection (Drive/Calendar) are independent and must never share code, tokens, or sessions. See spec §4.3.
- **Price/name snapshots.** `contract_packages` stores its own `name_snapshot` and `price_snapshot` — never join to live `packages` data to determine what an existing contract charged. See spec §6.5.
- **Role permissions are enforced at the data-access layer**, not only hidden in the UI. A `normal` user's queries must be scoped by `createdById` at the query itself. See spec §5.
- **`viewer_token`, not the internal `id`,** is what's ever exposed in a public URL (the contract viewer, the WhatsApp link). See spec §10.

## Workflow

1. Read `docs/spec.md` sections relevant to the current task.
2. Read the current sprint's `tasks.md` in `specs/`.
3. Implement one task at a time; verify against its "Done when" criterion before moving to the next.
4. When every task in the current sprint's `tasks.md` is checked off, stop and wait for the next sprint's folder to be added — do not start building ahead of the defined scope.
