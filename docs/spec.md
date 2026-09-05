# Contract management system — product & technical specification

**Client:** Todo con un Solo Proveedor
**Purpose of this document:** single source of truth for AI coding agents implementing this system via spec-driven development (SDD). Every section is written to be unambiguous and directly implementable. Where a decision has not been made, it is explicitly flagged in section 12 instead of left implicit.

**Language convention:** all code, database identifiers, API routes, and this document are in English. The product itself (UI copy, generated contracts, client-facing content) is in Spanish (Mexico).

**UI design source of truth:** `docs/design-system.md` — tokens, component conventions, and content/voice rules derived from the Claude Design project "Sistema de diseño de pagos". Read it before implementing any screen, page, or UI component; do not invent visual or copy conventions ad hoc when it already has an answer.

---

## 1. Overview

A web application for a single event-services provider (weddings, quinceañeras, graduations, and similar events) to manage the full lifecycle of event contracts: package/service catalog, contract creation, payment tracking, contract image generation, delivery (email + WhatsApp), and Google Drive/Calendar backup.

Expected volume: **~2 contracts per week**. This number drives several architecture decisions below (no job queue, free-tier hosting, synchronous processing) — do not over-engineer for scale beyond this.

## 2. Goals and non-goals

**Goals**
- Centralize contract creation, payment tracking, and package/price administration.
- Generate the contract as an image on the client's existing JPEG template.
- Deliver the contract by email and by WhatsApp (via ManyChat), backed up to Google Drive and Google Calendar.
- Support two user roles with different data visibility.

**Non-goals (explicitly out of scope)**
- Multi-tenant support (this is a single-business system).
- A job queue / message broker (Redis, BullMQ, SQS, etc.) — deliberately excluded, see §4.2.
- Migrating data from the client's previous system — not required.
- Client self-service portal (clients only ever access the read-only contract viewer link).
- Native mobile app — responsive web only.

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Single deployable for frontend + backend |
| Styling | Tailwind CSS | |
| UI components | shadcn/ui | |
| Forms/validation | react-hook-form + zod | Share zod schemas between client and server validation |
| Database | PostgreSQL (Neon or Supabase free tier) | |
| ORM | Prisma | Schema in `schema.prisma` should mirror §6 exactly |
| Auth | Auth.js (NextAuth) — Credentials provider only | Email + password only, no Google sign-in for users. Not to be confused with the separate Google Master connection, see §4.3 |
| Contract image generation | `@napi-rs/canvas` | Chosen over `canvas` for serverless compatibility on Vercel; chosen over Puppeteer/HTML rendering because the base template is a fixed JPEG, not a layout that needs a browser engine |
| Email delivery | Resend | Free tier sufficient for volume |
| WhatsApp delivery | ManyChat (existing client integration) | The app's responsibility is only to produce the public viewer link; ManyChat handles the actual WhatsApp send |
| Calendar UI | react-big-calendar or FullCalendar | |
| Report export | exceljs | Excel export only, no PDF export required |
| Hosting | Vercel (free tier) | |

## 4. Architecture

### 4.1 Layers

```
Frontend (Next.js pages)
  ├─ Admin panel        — authenticated, role-gated
  └─ Public contract viewer — /contracts/view/[viewerToken], no auth
        │
        ▼
Backend API (Next.js API routes / route handlers)
  — all business logic, all external service calls
        │
        ├─→ PostgreSQL (via Prisma)         — synchronous, always
        ├─→ Google APIs (Drive, Calendar)   — synchronous, sequential, see §4.2
        ├─→ Resend (email)                  — synchronous, sequential, see §4.2
        └─→ ManyChat (WhatsApp trigger)     — synchronous, sequential, see §4.2
```

### 4.2 No job queue — sequential in-process processing with retry-by-status

**Decision:** no Redis, no BullMQ, no background worker process. This was deliberately chosen over a queue-based design to reduce operational complexity, justified by the low volume (~2 contracts/week).

When a contract is confirmed (last step of the creation flow, §8):

1. The API route creates the `Contract` row immediately (status columns default to `false`/pending).
2. In the **same request**, it runs each delivery step in sequence: generate image → upload to Drive → create Calendar event → send email → (client opens WhatsApp link generated for ManyChat).
3. After each step succeeds, the corresponding boolean column on `contracts` is set to `true` (`imageGenerated`, `driveUploaded`, `calendarCreated`, `emailSent`; see §6.4 for full column list).
4. If a step throws, the response still returns success for contract creation (the contract row exists), but reports which step failed. The contract list UI must show a visual indicator for any contract with an incomplete step.
5. Each status column has a **manual retry** action in the UI (e.g., a "retry Drive upload" button on the contract detail page) that re-runs only that step, idempotently. Retrying must not create duplicate Drive files, duplicate Calendar events, or duplicate emails — check the relevant ID/status column before acting.

This pattern (status columns + manual retry) is the intended replacement for a queue's retry mechanism. Do not introduce a queue, cron job, or background worker to "improve" this — it is a deliberate simplification given the low volume.

### 4.3 User login vs. the Google Master connection — do not conflate these

**Flow A — user login.** Email + password only (Auth.js Credentials provider). There is no Google sign-in and no self-service registration for users — accounts are created exclusively by a `super` user via the user management CRUD (§5, §14). **Corrected 2026-09-05**: an earlier draft of this spec called for an additional Google sign-in option for user login; that has been dropped. `users.password_hash` is therefore always required (see §6.1) — every account is created with a password by a `super` user.

**Flow B — Google Master connection.** A single Google account belonging to the business, connected once by a `super` user through a separate, manual OAuth flow (not Auth.js). Its `refresh_token` is stored encrypted in the `google_connection` table (§6.6) and is used for **every** Drive upload and Calendar event creation, regardless of which user is logged in. This is the **only** Google OAuth flow in the system.

If the Master token expires or is revoked:
- Contract creation must **not** be blocked.
- The dashboard/header shows a persistent warning banner indicating the connection is broken (visible to all roles, reconnect action visible only to `super`, per §5).
- Drive upload and Calendar creation steps for new contracts will fail and remain retriable per §4.2 once reconnected.

Never read from or write to the `google_connection` refresh token using the session token of whichever user is currently logged in. These are two independent credential stores.

## 5. Roles and permissions

Two roles: `super` and `normal`. Enforce via a shared authorization check (e.g., a `requireRole` guard or query-scoping helper), not repeated per-route conditionals.

| Module | `normal` | `super` |
|---|---|---|
| Contracts — list/view | Only contracts where `createdById = self` | All |
| Contracts — create | Yes | Yes |
| Contracts — edit | Only contracts where `createdById = self` | All |
| Contracts — cancel | **No** | Yes |
| Payments — create/view | Only on contracts where `createdById = self` | On any contract |
| Notes — create/view | Only on contracts where `createdById = self` | On any contract |
| Reports | Scoped to contracts where `createdById = self` | All contracts |
| Calendar | Only own contracts' events | All events |
| Catalog (categories, packages, services) | Read-only (for contract creation) | Full CRUD |
| Price lists | Read-only (for contract creation) | Full CRUD, can set default |
| Users | No access | Full CRUD |
| Google Master connection | Read-only status banner | Read status + reconnect action |

Implementation note: every query for `contracts`, `payments`, `notes` on behalf of a `normal` user must include `WHERE createdById = currentUser.id` at the data-access layer, not only hidden in the UI.

## 6. Data model

Table names: `snake_case`, plural. Prisma models: `PascalCase` singular, mapped via `@@map`. Column names: `snake_case` in the database, `camelCase` in Prisma/TypeScript (via Prisma's default mapping).

### 6.1 `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| email | text, unique | |
| password_hash | text | required — email + password is the only login method (§4.3) |
| role | enum: `super`, `normal` | |
| active | boolean, default true | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 6.2 `categories`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | e.g. "Sonido e iluminación", "Pantallas LED" |
| created_at | timestamptz | |

### 6.3 `packages`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| description | text, nullable | |
| category_id | uuid, FK → categories | |
| active | boolean, default true | |
| max_quantity | int, nullable | e.g. 99 for "LED screens" — null means quantity is always 1 |
| quantity_unit | text, nullable | e.g. "pantallas", "banners" — display label next to the quantity selector |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 6.4 `contracts`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| folio | text, unique | generated at confirm time, not before |
| client_name | text | |
| client_phone | text, nullable | |
| client_mobile | text, nullable | |
| client_email | text, nullable | |
| client_address | text, nullable | |
| event_type | text | |
| celebrated | text, nullable | name(s) of the celebrant(s) — "festejado" / "novios" |
| event_date | date | |
| event_time | time, nullable | |
| place_name | text, nullable | |
| place_address | text, nullable | |
| contract_status | enum: `pre_contract`, `confirmed`, `completed`, `cancelled` | default `pre_contract`; moves to `confirmed` automatically when a payment brings `payment_status` to `deposit_paid` |
| payment_status | enum: `pending`, `deposit_paid`, `partial`, `paid_in_full` | default `pending` |
| cancellation_reason | text, nullable | required when `contract_status = cancelled` |
| discount | numeric(10,2), nullable | custom, manually-entered override only. Discount codes from the legacy system are **not** carried over — if null, no discount applied |
| extra_charge | numeric(10,2), nullable | |
| subtotal | numeric(10,2) | sum of `contract_packages.price_snapshot × quantity` |
| total | numeric(10,2) | `subtotal - discount + extra_charge` |
| deposit | numeric(10,2) | defaults per legacy rule (fixed minimum if `total <= threshold`, fixed maximum otherwise — port `MIN_CONTRACT_ADVANCE` / `MAX_CONTRACT_ADVANCE` / `TOTAL_CONTRACT_MIN` from the legacy `calculateFinalTotals` logic), overridable by the user at confirm time |
| balance | numeric(10,2) | `total - deposit`, can be computed on read rather than stored |
| viewer_token | text, unique | random, unguessable — used in the public viewer URL and the WhatsApp link. Never expose the internal `id` in that URL |
| image_generated | boolean, default false | |
| drive_uploaded | boolean, default false | |
| calendar_created | boolean, default false | |
| email_sent | boolean, default false | |
| drive_file_id | text, nullable | |
| calendar_event_id | text, nullable | |
| price_list_id | uuid, FK → price_lists | |
| created_by_id | uuid, FK → users | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 6.5 `contract_packages`
Snapshot table — captures the package name and price **as they were at contract time**. Never join to `packages` for historical pricing; always read from this table.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contract_id | uuid, FK → contracts | |
| package_id | uuid, FK → packages | reference only, not the source of truth for price/name on this contract |
| name_snapshot | text | |
| price_snapshot | numeric(10,2) | |
| quantity | int, default 1 | |

### 6.6 `services`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| details | text, nullable | |
| category_id | uuid, FK → categories | |
| options | jsonb, nullable | array of strings for "choose 1 of N" services; null/empty for services with no choice |
| created_at | timestamptz | |

### 6.7 `package_services`
Many-to-many join between packages and the services they include.
| Column | Type | Notes |
|---|---|---|
| package_id | uuid, FK → packages | |
| service_id | uuid, FK → services | |
| — | | composite PK (`package_id`, `service_id`) |

### 6.8 `contract_service_selections`
Records which option the client actually chose, for services that have `options`. Only created for services that have non-empty `options`.
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contract_id | uuid, FK → contracts | |
| service_id | uuid, FK → services | |
| selected_option | text | must be one of the strings in `services.options` for that service |

### 6.9 `price_lists`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| is_default | boolean, default false | exactly one row should have this true — enforce at the application layer |
| active | boolean, default true | |
| created_at | timestamptz | |

### 6.10 `package_prices`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| package_id | uuid, FK → packages | |
| price_list_id | uuid, FK → price_lists | |
| price | numeric(10,2) | |
| — | | unique (`package_id`, `price_list_id`) |

### 6.11 `payments`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contract_id | uuid, FK → contracts | |
| amount | numeric(10,2) | |
| method | enum: `cash`, `bank_transfer`, `card`, `other` | fixed list, not free text — adjust the exact set of values with the client if needed, but keep it an enum |
| payment_date | date | |
| note | text, nullable | |
| recorded_by_id | uuid, FK → users | |
| created_at | timestamptz | |

### 6.12 `notes`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| contract_id | uuid, FK → contracts | |
| user_id | uuid, FK → users | |
| text | text | |
| created_at | timestamptz | |

### 6.13 `google_connection`
Singleton table — application logic must enforce exactly one row.
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| connected | boolean, default false | |
| refresh_token_encrypted | text, nullable | encrypt at rest, never log or return via API |
| connected_by_id | uuid, FK → users, nullable | |
| connected_at | timestamptz, nullable | |
| last_error | text, nullable | shown in the admin reconnect UI |
| updated_at | timestamptz | |

## 7. Contract image generation

- The base template is the client's existing JPEG (`contract.jpg`). Do not redesign it or replace it with an HTML/CSS-rendered template.
- Use `@napi-rs/canvas`: load the JPEG as the base image, then draw text fields at fixed x/y coordinates.
- Field coordinates must live in a single declarative config object (e.g. `lib/contract-template/fields.ts`), not scattered inline `fillText` calls. Example shape:
  ```ts
  export const CONTRACT_TEMPLATE_FIELDS = {
    folio: { x: 990, y: 75 },
    clientName: { x: 232, y: 660, maxWidth: 400 },
    // ...
  }
  ```
- Any field whose text may exceed its allotted space (client name, address, service list) must wrap to multiple lines within `maxWidth` rather than overflowing — implement a shared `drawWrappedText(ctx, text, field)` helper used for every field, not just the long ones.
- Money fields are formatted with `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`.
- Output format: JPEG buffer, same as the legacy implementation.

## 8. Contract creation flow ("store mode")

Multi-step wizard, client-side state only until the final step — **no database writes occur before step 6**.

1. **Choose price list.** Defaults to the list where `is_default = true`; user may switch. All subsequent prices reflect this selection.
2. **Add packages to the order.** Store-style catalog grouped by category. Packages with `max_quantity` show a quantity selector up to that max.
3. **Resolve service choices.** For any added package whose included services have non-empty `options`, the user must pick one option per such service before continuing. Skipped entirely if none apply.
4. **Fill contract data.** Client name/contact, event type, date/time, celebrant(s), venue name/address.
5. **Confirm amounts.** System proposes a default deposit per the threshold rule in §6.4; user may override discount, deposit, and extra charge.
6. **Confirm and generate.** Single action: creates the `contracts` row (folio generated here), creates `contract_packages` and `contract_service_selections` rows, then runs the sequential delivery pipeline from §4.2.

## 9. Reports

Filterable by date range, price list, creating user, client, and event type (per the original proposal). `normal` users' reports are always scoped to `createdById = self` (§5). Export to Excel via `exceljs`; PDF export is not required.

## 10. Public contract viewer

Route: `/contracts/view/[viewerToken]`, no authentication. Displays the generated contract image (and/or the underlying data) for the client to review. This is the destination of the link ManyChat sends over WhatsApp. Must not expose any other contract's data or any internal numeric ID.

## 11. Hosting and environment

- Vercel free tier for the Next.js app (frontend + API routes).
- PostgreSQL via Neon or Supabase free tier.
- Resend free tier for email.
- Environment variables must include (at minimum): `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOOGLE_MASTER_CLIENT_ID`/`SECRET` (Flow B, §4.3 — the only Google OAuth credentials the system needs), `RESEND_API_KEY`, `MIN_CONTRACT_ADVANCE`, `MAX_CONTRACT_ADVANCE`, `TOTAL_CONTRACT_MIN`, `TOKEN_ENCRYPTION_KEY` (for `google_connection.refresh_token_encrypted`).
- **`DIRECT_URL`** (local/dev only, not deployed to Vercel): Supabase's direct (non-pooled, port 5432) connection string, used exclusively by `prisma.config.ts` for `prisma migrate`/`db push`/introspection. `DATABASE_URL` (Supabase's transaction pooler, port 6543) is what the running app actually connects with (see `src/lib/prisma.ts`) and is the one configured in Vercel — the pooler doesn't hold the session-level locks Prisma Migrate needs, so Migrate must always go through the direct connection instead.

## 12. Resolved decisions log

No open questions remain. The following decisions were confirmed and are reflected throughout this document:

1. **Discount codes** — not carried over from the legacy system. Only the manual per-contract `discount` override exists (§6.4).
2. **Payment method** — fixed enum (`cash`, `bank_transfer`, `card`, `other`), not free text (§6.11).
3. **Calendar visibility for `normal` users** — scoped to their own contracts' events only (§5).
4. **Google connection banner** — visible to all roles (read-only for `normal`, reconnect action for `super`) (§5).
5. **Cancellation reason** — free text field (§6.4).
6. **User login has no Google sign-in** (corrected 2026-09-05, during Sprint 2 implementation) — email + password only, via the Auth.js Credentials provider. Accounts are created exclusively by a `super` user through the user management CRUD (§5, §14); there is no self-service registration. This was a drafting error in the original spec, which called for an additional Google sign-in option for users — dropped in favor of a single, `super`-controlled account-creation path. `users.password_hash` is required as a result (§6.1).

## 13. Implementation roadmap

These are dependency-ordered work packages, not fixed-duration calendar sprints — this is a single developer working with AI coding agents, so pace them as needed. Each package should leave the system in a verifiable state before the next one begins; do not start a later package until the ones it depends on are functionally complete.

### Sprint 1 — Foundations and data model
Next.js + TypeScript + Tailwind + shadcn/ui scaffolding. Prisma schema mirroring §6 in full. Database provisioned (Neon or Supabase). Vercel deployment pipeline working end to end (a health-check page is enough to verify it). Nothing else can be built before this.

### Sprint 2 — Authentication and roles
Auth.js with the Credentials provider only (§4.3 — email + password, no Google sign-in for users). `users` table and its CRUD (super only) — the only way accounts are created. Authorization middleware that enforces the §5 permission matrix at the data-access layer, not only in the UI.

### Sprint 3 — Catalog (packages, services, prices)
Full CRUD for `categories`, `packages` (including `max_quantity`/`quantity_unit`), `services` (including `options`), `package_services`, `price_lists`, and `package_prices`. Read-only views for `normal` users; edit access restricted to `super`.

### Sprint 4 — Contract creation flow (store mode)
The 6-step wizard from §8, fully functional client-side through step 5. Step 6 writes `contracts`, `contract_packages`, and `contract_service_selections` to the database, including folio generation and the default deposit calculation. No delivery pipeline yet — the contract is only created and stored.

### Sprint 5 — Contract image generation
`@napi-rs/canvas` overlay on the existing JPEG template (§7): declarative field-coordinate config, shared text-wrapping helper, generation endpoint, wired into the confirm step with its `image_generated` status column.

### Sprint 6 — Google Master integration
Flow B OAuth (§4.3, kept separate from login), `google_connection` table, Drive upload and Calendar event creation wired into the confirm step, reconnect banner visible to all roles (§5) with a per-step retry action.

### Sprint 7 — Delivery: email, WhatsApp, and public viewer
Resend integration for email. Public contract viewer page keyed by `viewer_token` (§10). WhatsApp link generation for ManyChat. Full sequential delivery pipeline with manual per-step retry, per §4.2.

### Sprint 8 — Payments, notes, reports, calendar, and dashboard
Payments module with `payment_status` transitions, notes per contract, filterable reports with Excel export (§9), role-scoped calendar view, dashboard indicators, and a final responsive QA pass.

## 14. Sprint 1 task breakdown — Foundations and data model

Tasks 1-2 and 3-4 can be done in any order relative to each other. Tasks 5-6 depend on 3-4 (the schema needs a database to migrate against). Tasks 7-8 depend on 5-6 (the health-check is meaningless without a database with tables).

1. **Initialize the Next.js project.** App Router + TypeScript, ESLint configured, base folder structure (`app/`, `lib/`, etc.). Done when `npm run dev` runs with no errors and the repo is under version control.
2. **Configure Tailwind CSS and shadcn/ui.** Initialize shadcn/ui with base theme tokens. Done when a sample component (button, card) renders correctly with styles applied.
3. **Define environment variables.** Create `.env.example` with every variable listed in §11 (`DATABASE_URL`, `NEXTAUTH_SECRET`, Google credentials for both flows, `RESEND_API_KEY`, deposit thresholds, encryption key). Done when the file exists and each variable has a comment explaining its purpose.
4. **Provision the database.** Create a Neon or Supabase project (free tier) and obtain `DATABASE_URL`. Done when a test connection from local succeeds.
5. **Write the full Prisma schema.** Translate the 13 tables, enums, and relations from §6 into `schema.prisma`, using `snake_case` in the database and `camelCase` in code via `@map`/`@@map`. Done when `prisma validate` passes and every table in the spec has a corresponding model.
6. **Run the initial migration.** Run `prisma migrate dev` against the provisioned database. Done when all 13 tables exist and their columns match §6 exactly (types, nullability, defaults, enums).
7. **Create the health-check endpoint.** A route handler at `/api/health` that runs a simple database query and returns 200 if the connection works, 500 if it fails. Done when it responds correctly locally.
8. **Deploy to Vercel and verify in production.** Connect the repository to Vercel, configure the environment variables from task 3 in the Vercel dashboard, deploy. Done when `/api/health` returns 200 at the production URL.
