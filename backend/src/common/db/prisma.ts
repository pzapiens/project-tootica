import { PrismaPg } from '@prisma/adapter-pg';

import { env, isProduction } from '../../config/env';
import { PrismaClient } from '../../generated/prisma/client';

// Prisma 7 connects through a driver adapter instead of a bundled query engine.
// The pg adapter owns its own connection pool, seeded from DATABASE_URL.
const adapter = new PrismaPg({ connectionString: env.databaseUrl });

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter,
    log: isProduction ? ['error'] : ['query', 'warn', 'error'],
  });
}

// Reuse a single client across `tsx watch` hot reloads so we don't exhaust the
// connection pool with an orphaned client per reload in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
