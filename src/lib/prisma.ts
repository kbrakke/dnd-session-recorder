import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

declare global {
  var prisma: PrismaClient | undefined;
  var prismaInitialized: boolean | undefined;
}

const createPrismaClient = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Only log on first initialization to avoid spam during HMR
  if (!globalThis.prismaInitialized) {
    logger.debug('Initializing Prisma Client', {
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: process.env.DATABASE_URL ? '[SET]' : '[NOT SET]'
    });
    globalThis.prismaInitialized = true;
  }

  const client = new PrismaClient({
    log: !isProduction
      ? ['error', 'warn']
      : ['error'],
    errorFormat: 'pretty',
  });

  // Log successful connection (only once per client instance)
  if (!isProduction) {
    client.$connect()
      .then(() => {
        logger.info('Database connected successfully');
      })
      .catch((error) => {
        logger.error('Failed to connect to database', error);
      });
  }

  return client;
};

// Only create new client if one doesn't exist
// In development, globalThis.prisma persists across HMR
export const prisma = globalThis.prisma ?? createPrismaClient();

// Store in global for development to prevent multiple instances during HMR
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

// Handle graceful shutdown only in production
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}

export default prisma;