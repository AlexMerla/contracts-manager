# Sprint 1 — Foundations and data model

Reference: `docs/spec.md` §6 (data model), §11 (environment), §13 (roadmap overview).

Dependency note: tasks 1-2 and 3-4 can be done in any order relative to each other. Tasks 5-6 depend on 3-4 (the schema needs a database to migrate against). Tasks 7-8 depend on 5-6 (the health-check is meaningless without a database with tables).

- [x] **1. Initialize the Next.js project.** App Router + TypeScript, ESLint configured, base folder structure (`app/`, `lib/`, etc.). Done when `npm run dev` runs with no errors and the repo is under version control.

- [x] **2. Configure Tailwind CSS and shadcn/ui.** Initialize shadcn/ui with base theme tokens. Done when a sample component (button, card) renders correctly with styles applied.

- [ ] **3. Define environment variables.** Create `.env.example` with every variable listed in spec §11 (`DATABASE_URL`, `NEXTAUTH_SECRET`, Google credentials for both flows, `RESEND_API_KEY`, deposit thresholds, encryption key). Done when the file exists and each variable has a comment explaining its purpose.
  - **BLOCKED**: content fully drafted at `env-example-reference.txt` (repo root), but this environment's global Claude permission config (`~/.claude/settings.json` → `permissions.deny`) hard-blocks any tool — Write, Edit, and Bash (`mv`/`cat`) alike — from touching a path matching `.env.*` in this project, so the agent cannot create/rename it to `.env.example` itself. A human (or a session with that deny rule relaxed) needs to run: `mv env-example-reference.txt .env.example` from the repo root to finish this task.

- [ ] **4. Provision the database.** Create a Neon or Supabase project (free tier) and obtain `DATABASE_URL`. Done when a test connection from local succeeds.

- [ ] **5. Write the full Prisma schema.** Translate the 13 tables, enums, and relations from spec §6 into `schema.prisma`, using `snake_case` in the database and `camelCase` in code via `@map`/`@@map`. Done when `prisma validate` passes and every table in the spec has a corresponding model.

- [ ] **6. Run the initial migration.** Run `prisma migrate dev` against the provisioned database. Done when all 13 tables exist and their columns match spec §6 exactly (types, nullability, defaults, enums).

- [ ] **7. Create the health-check endpoint.** A route handler at `/api/health` that runs a simple database query and returns 200 if the connection works, 500 if it fails. Done when it responds correctly locally.

- [ ] **8. Deploy to Vercel and verify in production.** Connect the repository to Vercel, configure the environment variables from task 3 in the Vercel dashboard, deploy. Done when `/api/health` returns 200 at the production URL.

---
When all 8 tasks are checked off, stop. Do not start Sprint 2 work until `specs/sprint-02-auth-roles/tasks.md` exists.
