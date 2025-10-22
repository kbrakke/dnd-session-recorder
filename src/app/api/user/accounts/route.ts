import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch user's linked accounts
    const accounts = await prisma.account.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        provider: true,
        type: true,
      },
    });

    // Check if user has a password (credentials provider)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });

    // Add credentials provider if user has a password
    const allAccounts = [...accounts];
    if (user?.password) {
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
