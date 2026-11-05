// Runs a command against the TEST database only: loads `.env.test` over the
// environment (prisma.config.ts's `dotenv/config` never overrides a value
// that is already set), refuses if it points at the same database as `.env`,
// then spawns the command. Usage: node scripts/with-test-env.mjs prisma migrate deploy
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import dotenv from "dotenv";

const loaded = dotenv.config({ path: ".env.test", override: true, quiet: true });
if (loaded.error) {
  console.error("Falta .env.test con DATABASE_URL y DIRECT_URL de la base de pruebas.");
  process.exit(1);
}

const identity = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}|${parsed.username}|${parsed.pathname}`;
  } catch {
    return null;
  }
};
const appEnv = fs.existsSync(".env") ? dotenv.parse(fs.readFileSync(".env")) : {};
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const testDb = identity(process.env[key]);
  if (!testDb || testDb === identity(appEnv[key])) {
    console.error(`${key} de .env.test falta o apunta a la base de la aplicación; se cancela.`);
    process.exit(1);
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Uso: node scripts/with-test-env.mjs <comando> [args...]");
  process.exit(1);
}
const result = spawnSync("npx", [command, ...args], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
