import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { TestUser, isTestEmail } from '../fixtures/users';

const prisma = new PrismaClient();

export async function cleanupTestUsers(): Promise<void> {
  try {
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true }
    });

    const testUserIds = allUsers
      .filter(user => user.email && isTestEmail(user.email))
      .map(user => user.id);

    if (testUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: testUserIds } }
      });
      console.log(`Cleaned up ${testUserIds.length} test users`);
    }
  } catch (error) {
    console.error('Error cleaning up test users:', error);
  }
}

export async function createTestUser(userData: TestUser): Promise<{ id: string; email: string; name: string }> {
  const hashedPassword = await hash(userData.password, 12);
  
  try {
    const user = await prisma.user.create({
      data: {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
      }
    });
    
    return {
      id: user.id,
      email: user.email || '',
      name: user.name || ''
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email },
        select: { id: true, email: true, name: true }
      });
      
      if (existingUser) {
        return {
          id: existingUser.id,
          email: existingUser.email || '',
          name: existingUser.name || ''
        };
      }
    }
    throw error;
  }
}

export async function seedTestUsers(users: TestUser[]): Promise<void> {
  for (const userData of users) {
    await createTestUser(userData);
  }
}

export async function getTestUser(email: string): Promise<{ id: string; email: string; name: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true }
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email || '',
    name: user.name || ''
  };
}

export async function deleteTestUser(email: string): Promise<void> {
  await prisma.user.delete({
    where: { email }
  });
}

export async function withTestTransaction<T>(
  callback: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    return await callback(tx as PrismaClient);
  });
}

export async function resetTestDatabase(): Promise<void> {
  await cleanupTestUsers();
}

export { prisma as testPrisma };