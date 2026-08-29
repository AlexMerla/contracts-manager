import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Standard Next.js singleton pattern: in dev, hot-reload re-executes this
// module on every edit, which would otherwise open a new connection pool
// each time and exhaust the database's connection limit. Stashing the
// client on `globalThis` survives the reload; in production a fresh
// module instance is created once per server process, which is fine.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
