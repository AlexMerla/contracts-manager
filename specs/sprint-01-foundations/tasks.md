# Sprint 1 — Foundations and data model

Reference: `docs/spec.md` §6 (data model), §11 (environment), §13 (roadmap overview).

Dependency note: tasks 1-2 and 3-4 can be done in any order relative to each other. Tasks 5-6 depend on 3-4 (the schema needs a database to migrate against). Tasks 7-8 depend on 5-6 (the health-check is meaningless without a database with tables).

- [x] **1. Initialize the Next.js project.** App Router + TypeScript, ESLint configured, base folder structure (`app/`, `lib/`, etc.). Done when `npm run dev` runs with no errors and the repo is under version control.

- [x] **2. Configure Tailwind CSS and shadcn/ui.** Initialize shadcn/ui with base theme tokens. Done when a sample component (button, card) renders correctly with styles applied.

- [x] **3. Define environment variables.** Create `.env.example` with every variable listed in spec §11 (`DATABASE_URL`, `NEXTAUTH_SECRET`, Google credentials for both flows, `RESEND_API_KEY`, deposit thresholds, encryption key). Done when the file exists and each variable has a comment explaining its purpose.

- [x] **4. Provision the database.** Create a Neon or Supabase project (free tier) and obtain `DATABASE_URL`. Done when a test connection from local succeeds.
  - Resolved on the 3rd attempt: `DATABASE_URL` now holds the correct direct Postgres connection string (`db.<project-ref>.supabase.co:5432`, database `postgres`). A throwaway `pg` connection test (script not committed, deleted after use; only non-secret metadata + pass/fail were ever printed) confirmed `SELECT 1` succeeds.

- [x] **5. Write the full Prisma schema.** Translate the 13 tables, enums, and relations from spec §6 into `schema.prisma`, using `snake_case` in the database and `camelCase` in code via `@map`/`@@map`. Done when `prisma validate` passes and every table in the spec has a corresponding model.
  - All 13 tables from spec §6 modeled in `prisma/schema.prisma`, plus 4 enums (`UserRole`, `ContractStatus`, `PaymentStatus`, `PaymentMethod`) mapped to snake_case DB enum type names. `npx prisma validate` passes.
  - **Prisma 7 note**: this project's installed `prisma`/`@prisma/client` is v7.10.0, which removed `datasource.url` from `schema.prisma` and requires driver-adapter-based configuration instead. Added `prisma.config.ts` at the repo root (loads `.env` via `dotenv/config`, since Prisma no longer auto-loads it) and changed the `generator client` block to `provider = "prisma-client"` with `output = "../src/generated/prisma"` (the new default generator, replacing `prisma-client-js`). `src/generated/` is gitignored and regenerated via a new `postinstall: prisma generate` script in `package.json`, since Prisma 7 generates into the project source instead of `node_modules`.
  - **Schema decisions not 100% explicit in spec §6**: (a) `contracts.balance` — spec allows "computed on read rather than stored," but since it's listed as a real column with a type and the task's Done-when criterion is "columns match spec §6 exactly," it's stored as a real `Decimal(10,2)` column, not computed. (b) `updated_at` columns (`users`, `packages`, `contracts`, `google_connection`) use Prisma's `@updatedAt` (auto-managed on every write) since the spec lists the column but doesn't say who's responsible for maintaining it — this was the most idiomatic choice. (c) All UUID primary keys use `@default(uuid())` (client-generated UUIDv4), not a Postgres-side `gen_random_uuid()`, to avoid depending on the `pgcrypto` extension being enabled on the Supabase instance.

- [x] **6. Run the initial migration.** Run `prisma migrate dev` against the provisioned database. Done when all 13 tables exist and their columns match spec §6 exactly (types, nullability, defaults, enums).
  - `npx prisma migrate dev --name init` applied successfully (migration `prisma/migrations/20260828064535_init`). Verified directly against `information_schema` (via the same throwaway `pg` script pattern, deleted after use) that all 13 spec tables exist (plus Prisma's own `_prisma_migrations` bookkeeping table) with matching columns, types, nullability, and defaults, and all 4 enum types with the exact values from spec §6.

- [x] **7. Create the health-check endpoint.** A route handler at `/api/health` that runs a simple database query and returns 200 if the connection works, 500 if it fails. Done when it responds correctly locally.
  - `src/app/api/health/route.ts` runs `prisma.$queryRaw\`SELECT 1\`` in a try/catch, returns `{ status: "ok" }` (200) on success or `{ status: "error" }` (500) on any thrown error. Backed by a shared `src/lib/prisma.ts` singleton (standard Next.js `globalThis` pattern to avoid exhausting connections across dev hot-reloads), instantiated with `@prisma/adapter-pg`'s `PrismaPg` adapter per Prisma 7's driver-adapter requirement. Live-tested: ran `npm run dev`, `curl localhost:3000/api/health` → `200 {"status":"ok"}` against the real Supabase DB. The 500/failure branch is code-reviewed (try/catch wraps the only DB call, any thrown error short-circuits to the 500 response) but not live-tested — simulating the DB being down wasn't practical in this session.

- [ ] **8. Deploy to Vercel and verify in production.** Connect the repository to Vercel, configure the environment variables from task 3 in the Vercel dashboard, deploy. Done when `/api/health` returns 200 at the production URL.

---
When all 8 tasks are checked off, stop. Do not start Sprint 2 work until `specs/sprint-02-auth-roles/tasks.md` exists.
