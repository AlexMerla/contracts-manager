import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Migrate/introspect need a direct (non-pooled) connection — Supabase's
// transaction pooler (used by DATABASE_URL at runtime, see src/lib/prisma.ts)
// doesn't hold the session-level advisory locks Migrate requires and hangs
// indefinitely. This datasource.url is CLI-only; the app's Prisma Client
// never reads prisma.config.ts and keeps using the pooled DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
