# Sprint 2 — Authentication and roles

Reference: `docs/spec.md` §4.3 (the two separate Google OAuth flows — this sprint only implements Flow A, user login), §5 (permission matrix), §6.1 (`users` table).

Dependency note: 1-4 get basic login working end to end and should be done in order. 5-7 build the authorization layer on top of that and depend on 1-4. 8 is the first feature protected by that layer and depends on 6-7.

- [ ] **1. Install Auth.js with the Credentials provider.** Configure NextAuth with email/password sign-in against the `users` table, hashing passwords with bcrypt (or argon2). Done when a seeded user can sign in with email + password and a session cookie is set.

- [ ] **2. Configure the Google provider for user login (Flow A only).** Use a separate set of OAuth client credentials from the ones that will be used for the Google Master connection in Sprint 6 — do not reuse or share them. On first sign-in, create or link a `users` row via `google_id`. Done when "Sign in with Google" produces a valid session and a corresponding `users` row.

- [ ] **3. Build the login page.** A responsive `/login` page with email/password fields and a "Sign in with Google" button. Done when both sign-in methods are reachable and functional from this page.

- [ ] **4. Write a seed script for the first super user.** Since `users` starts empty, provide a script (e.g. `prisma/seed.ts`) that creates one `super`-role user with a hashed password, driven by env vars so it isn't hardcoded credentials in the repo. Done when running the seed produces exactly one working `super` login.

- [ ] **5. Expose role on the session.** Extend the Auth.js session/JWT callbacks so `session.user.role` and `session.user.id` are available in server components and route handlers. Done when a route handler can read the current user's role and id without an extra database query.

- [ ] **6. Build the authorization layer.** A shared helper (e.g. `requireRole(role)` and a `scopeToOwner(query, session)` helper) that enforces the spec §5 matrix at the data-access layer — not only in the UI. For a `normal` session, this helper must add the `createdById = session.user.id` filter to `contracts`/`payments`/`notes` queries automatically rather than relying on each route to remember it. Done when a unit test proves a `normal`-role query cannot return another user's data even if the route forgets to filter explicitly.

- [ ] **7. Protect routes and pages.** Apply the Sprint 2 authorization helper to route groups: unauthenticated requests redirect to `/login`; `normal`-role requests to `super`-only pages (e.g. user management) are rejected. Done when both cases are verified manually or with a route test.

- [ ] **8. Build user management (CRUD).** `super`-only pages to list, create, edit, deactivate, and change the role of users, per spec §5. Done when a `super` user can perform all four actions and a `normal` user cannot reach these pages at all (not just a hidden nav link — the route itself must reject them, per task 6).

---
When all 8 tasks are checked off, stop. Do not start Sprint 3 work until `specs/sprint-03-catalog/tasks.md` exists.
