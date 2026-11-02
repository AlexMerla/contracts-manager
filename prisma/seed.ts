import { randomBytes } from "node:crypto";

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// public-precontract Q1 — kept in sync with src/lib/contracts/house-user.ts.
// Not imported from there: that module pulls in `@/lib/prisma` (and the `@`
// alias), which this standalone `tsx prisma/seed.ts` script does not resolve.
const HOUSE_USER_EMAIL = "cliente-web@precontrato.invalid";
const HOUSE_USER_NAME = "Cliente (web)";

async function main() {
  const email = process.env.SEED_SUPER_USER_EMAIL;
  const password = process.env.SEED_SUPER_USER_PASSWORD;
  const name = process.env.SEED_SUPER_USER_NAME ?? "Super Usuario";

  if (!email || !password) {
    throw new Error(
      "SEED_SUPER_USER_EMAIL and SEED_SUPER_USER_PASSWORD must be set in the environment to run the seed."
    );
  }

  const passwordHash = await hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "super", active: true },
    create: { email, name, passwordHash, role: "super", active: true },
  });

  console.log(`Seeded super user: ${user.email}`);

  await seedHouseUser();
}

/**
 * The owner of every contract created through the public /precontrato flow.
 *
 * `role: "normal"` and `active: false` — it must never be able to sign in:
 * `authorize()` in src/lib/auth.ts rejects `!user.active` before it even
 * compares the password, and the password here is a throwaway random value
 * nobody holds.
 *
 * Idempotent, and deliberately does NOT re-hash the password on update: a
 * second seed run must not rotate anything, it must only converge the name,
 * role and active flag if someone changed them through /usuarios.
 */
async function seedHouseUser() {
  const houseUser = await prisma.user.upsert({
    where: { email: HOUSE_USER_EMAIL },
    update: { name: HOUSE_USER_NAME, role: "normal", active: false },
    create: {
      email: HOUSE_USER_EMAIL,
      name: HOUSE_USER_NAME,
      role: "normal",
      active: false,
      passwordHash: await hash(randomBytes(32).toString("hex"), 10),
    },
  });

  console.log(`Seeded house user for public pre-contracts: ${houseUser.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
