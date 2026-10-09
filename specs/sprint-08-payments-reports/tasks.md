# Sprint 8 — Payments, notes, reports, calendar, and dashboard

Reference: `docs/spec.md` §5 (permission matrix), §6.4 (`contracts.contractStatus`/`paymentStatus`/`balance`), §6.11 (`payments`), §6.12 (`notes`), §9 (reports).

Dependency note: 1-2 (payments) and 3 (notes) are independent of each other. 4-5 (reports) can start once payments exist, since reports surface payment-derived data. 6 (calendar) only needs contracts, so it can be built in parallel with payments/reports. 7 (dashboard) depends on 1-2, 4-5, and 6 — its indicators pull from all of them. 8 depends on everything.

- [x] **1. Build payments CRUD with status transition logic.** Register a payment (`amount`, `method` enum, `date`, `note`) against a contract, scoped per §5 (`normal` only on contracts they created). After each payment, recompute `paymentStatus` from the contract's cumulative paid amount vs. `deposit` and `total`:
  - cumulative paid `<` `deposit` → stays `pending`
  - cumulative paid crosses `deposit` for the first time (was below, now at or above, and still `< total`) → `deposit_paid`, and this is also the trigger that flips `contractStatus` from `pre_contract` to `confirmed` (spec §6.4)
  - a further payment recorded after `deposit_paid` has already been reached, while still `< total` → `partial`
  - cumulative paid `>= total` → `paid_in_full`

  This rule is confirmed (spec §12, item 6) — implement it as specified, no further confirmation needed.

  Done when registering payments in sequence drives a contract through `pending → deposit_paid → partial → paid_in_full` correctly, and the `pre_contract → confirmed` contract-status transition fires exactly once, the first time `deposit_paid` is reached.

- [x] **2. Build the payment history view.** On the contract detail page, list all payments for that contract with a running balance (`total` minus cumulative paid). Done when the displayed balance always matches cumulative payments, recalculated live after each new payment — not a stale stored value.

- [x] **3. Build the notes module.** Add/view notes per contract (§6.12), scoped per §5 the same way as payments. Done when a `normal` user can add and see notes only on contracts they created.

- [x] **4. Build filterable reports.** Filter by date range, price list, creating user, client, and event type (§9). `normal` users' results are always scoped to `createdById = self`, regardless of what filter values are submitted. Done when a `normal` user cannot see another user's contracts in a report even by explicitly selecting that user as a filter.

  _Verified: Route `/reportes` built with all six filters (date range on eventDate, price list, creating user, event type, client). Double authorization layer enforced server-side (both `page.tsx` and `export/route.ts` call `scopeToOwner` + `parseReportFilters` with role enforcement). All 244 tests pass (tsc/eslint clean). Manual normal-vs-super screen verification deferred to task 8._

- [x] **5. Add Excel export for reports.** Use `exceljs` to export the currently-filtered report results to `.xlsx` (§9 — no PDF export required). Done when the exported file's rows match the on-screen filtered results exactly, including when no filters are applied.

  _Verified: Export route via `GET /reportes/export` (nodejs runtime, `force-dynamic`) with exceljs. Seven-column Excel workbook (Folio, Cliente, Lista de precios, Creó, Total, Cobrado, Fecha with dd/mm/yyyy format as a real date cell), optional "Resumen por usuario creador" sheet for `super` only. Both screen and export call identical `fetchReportRows`/`filterReportRows` pair — rows match exactly. All 244 tests pass. Manual normal-vs-super download verification deferred to task 8._

- [ ] **6. Build the calendar view.** Using react-big-calendar or FullCalendar, show events derived from `contracts.eventDate`/`eventTime`. Scoped per the earlier decision: `normal` sees only their own contracts' events, `super` sees all. Done when a `normal` user's calendar never renders another user's event, even indirectly (e.g. via a shared "all events" count).

- [ ] **7. Build dashboard indicators.** Per the original proposal's dashboard requirement: monthly revenue, count of contracts with pending payment, upcoming events, and contracts created per user — each scoped by role the same way as the underlying data (a `normal` user's dashboard reflects only their own contracts). Done when every number on the dashboard matches what the corresponding report/list/calendar would show for that same user.

- [ ] **8. Final responsive QA pass.** Verify catalog, the contract wizard, payments, reports, calendar, and dashboard at mobile and tablet breakpoints. Done when a documented pass across the key breakpoints shows no broken layouts or controls that are unusable on a phone-sized screen.

---
This is the last sprint in the current roadmap (§13). When all 8 tasks are checked off, the system covers the full scope defined in `docs/spec.md`.
