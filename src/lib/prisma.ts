import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

const createPrismaClient = () => {
  console.log('[Prisma] Initializing Prisma Client');
  console.log('[Prisma] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Prisma] DATABASE_URL:', process.env.DATABASE_URL ? '[SET]' : '[NOT SET]');
  
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn', 'info'] 
      : ['error', 'warn'],
    errorFormat: 'pretty',
  });

  // Log successful connection
  client.$connect()
    .then(() => {
      console.log('[Prisma] ✅ Database connected successfully');
    })
    .catch((error) => {
      console.error('[Prisma] ❌ Failed to connect to database:', error);
    });

  return client;
};

export const prisma = globalThis.prisma || createPrismaClient();

// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

// Handle graceful shutdown
process.on('beforeExit', async () => {
  console.log('[Prisma] Disconnecting from database...');
  await prisma.$disconnect();
});

export default prisma;