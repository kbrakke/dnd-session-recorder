import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    // Fetch user's linked accounts
    const accounts = await prisma.account.findMany({
      where: {
        userId: user.id,
      },
      select: {
        provider: true,
        type: true,
      },
    });

    // Check if user has a password (credentials provider)
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });

    // Add credentials provider if user has a password
    const allAccounts = [...accounts];
    if (userRecord?.password) {
      allAccounts.push({
        provider: 'credentials',
        type: 'credentials',
      });
    }

    return NextResponse.json({ accounts: allAccounts });
  } catch (error) {
    logger.error('Failed to fetch user accounts', error as Error);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
