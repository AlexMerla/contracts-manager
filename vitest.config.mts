import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { configDefaults, defineConfig } from "vitest/config";

// The DB-backed suites create and delete real rows, so they must NEVER run
// against the database the app uses. `.env.test` supplies DATABASE_URL and
// DIRECT_URL for a dedicated test database and wins over `.env`; everything
// else (deposit thresholds, etc.) still comes from `.env`, which dotenv never
// lets override a value that is already set.
const testEnv = dotenv.config({ path: ".env.test", override: true, quiet: true });
if (testEnv.error) {
  throw new Error(
    "Falta .env.test con DATABASE_URL y DIRECT_URL de la base de pruebas. " +
      "Los tests nunca corren contra la base de la aplicación."
  );
}
dotenv.config({ quiet: true });
assertNotAppDatabase();

/** Refuses to run when a test DB URL points at the same database as `.env`. */
function assertNotAppDatabase(): void {
  if (!fs.existsSync(".env")) {
    return;
  }
  const appEnv = dotenv.parse(fs.readFileSync(".env"));
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const testDb = databaseIdentity(process.env[key]);
    if (!testDb) {
      throw new Error(`.env.test no define ${key}.`);
    }
    if (testDb === databaseIdentity(appEnv[key])) {
      throw new Error(`${key} de .env.test apunta a la base de la aplicación; los tests no se ejecutan.`);
    }
  }
}

/** host + user + database name; the password and query string don't matter. */
function databaseIdentity(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}|${parsed.username}|${parsed.pathname}`;
  } catch {
    return null;
  }
}

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
