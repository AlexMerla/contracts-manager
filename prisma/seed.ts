import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
