# Sprint 3 — Catalog (packages, services, prices)

Reference: `docs/spec.md` §5 (permission matrix), §6.2 (`categories`), §6.3 (`packages`), §6.6 (`services`), §6.7 (`package_services`), §6.9 (`price_lists`), §6.10 (`package_prices`).

Dependency note: 1-2 are independent standalone entities and can be done in any order. 3-4 depend on 1 (they need a `category_id` to attach to). 5 depends on 3 and 4 (it links packages to services). 6 depends on 3 and 2 (it links packages to price lists). 7 depends on 1, 3, and 4 (it needs real records to test against). 8 depends on everything above.

- [ ] **1. Categories CRUD.** `super`-only create/edit/delete for `categories`. Done when a category can be created, renamed, and deleted through the UI.

- [ ] **2. Price lists CRUD.** `super`-only create/edit/delete for `price_lists`, including a "set as default" action. Done when marking one list as default automatically unsets `is_default` on any previously-default list — spec §6.9 requires exactly one default at all times, enforced here at the application layer since the database doesn't guarantee it.

- [ ] **3. Packages CRUD.** `super`-only create/edit/delete for `packages`, including `maxQuantity`/`quantityUnit` (for items like LED screens with a bounded quantity) and the `active` toggle. Done when a package can be created with or without a quantity limit, and toggling `active` hides it from the store-mode catalog used in Sprint 4 without deleting it.

- [ ] **4. Services CRUD.** `super`-only create/edit/delete for `services`, including the `options` field (an editable list of strings for "choose 1 of N" services — spec §6.6). Done when a service can be created with zero or more options, and the options list can be reordered/edited after creation.

- [ ] **5. Package ↔ service association.** Within the package edit page, manage which `services` are included via `package_services` (spec §6.7) — a multi-select or checklist UI. Done when adding/removing a service from a package persists correctly and is reflected immediately when viewing that package.

- [ ] **6. Package prices per price list.** Within the package edit page, set/edit the `package_prices` row (spec §6.10) for each price list. Done when editing the price for one price list does not affect the package's price in any other list, and a newly-created price list starts with no price set for existing packages (must be filled in explicitly, not defaulted or copied).

- [ ] **7. Referential-integrity guards on delete.** Deleting a `category` or `service` that is still referenced (by a `package`, or by `package_services`) must be blocked with a clear error rather than silently cascading — packages already snapshot their own data into contracts at selection time (spec §6.5), but the catalog itself should stay consistent. Done when attempting to delete a referenced category or service fails with a message identifying what's still using it.

- [ ] **8. Read-only catalog browsing for `normal` users.** List/browse packages by category, view a package's included services and its price under the currently-selected price list. Enforce at the route level — not just by hiding buttons — that `normal` users cannot reach any create/edit/delete action, consistent with the Sprint 2 authorization layer (spec §5). Done when a `normal`-role request to a catalog write endpoint is rejected even if made directly (e.g. via curl), not only blocked in the UI.

---
When all 8 tasks are checked off, stop. Do not start Sprint 4 work until `specs/sprint-04-contract-creation/tasks.md` exists.
