import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/services/database';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/test/cleanup-user
 * 
 * Test-only endpoint for cleaning up test users and their associated data.
 * Requires TEST_CLEANUP_KEY environment variable to be set and provided in X-Test-Key header.
 * 
 * This endpoint should only be enabled in staging/test environments.
 */
export async function DELETE(request: NextRequest) {
  try {
    // Verify test cleanup key
    const testKey = request.headers.get('X-Test-Key');
    const expectedKey = process.env.TEST_CLEANUP_KEY;

    if (!expectedKey) {
      logger.warn('TEST_CLEANUP_KEY not configured');
      return NextResponse.json(
        { error: 'Test cleanup not configured' },
        { status: 503 }
      );
    }

    if (testKey !== expectedKey) {
      logger.warn('Invalid test cleanup key attempted');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only allow in non-production environments
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_CLEANUP) {
      logger.warn('Test cleanup attempted in production');
      return NextResponse.json(
        { error: 'Test cleanup not allowed in production' },
        { status: 403 }
      );
    }

    // Get email from request body
    const body = await request.json().catch(() => ({}));
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Only allow cleanup of test emails
    const isTestEmail = email.includes('@example.com') || 
                        email.includes('@test.com') ||
                        email.startsWith('test-') ||
                        email.startsWith('apitest-') ||
                        email.startsWith('batch-') ||
                        email.includes('-test-');

    if (!isTestEmail) {
      logger.warn('Attempted to cleanup non-test user', { email });
      return NextResponse.json(
        { error: 'Can only cleanup test users' },
        { status: 403 }
      );
    }

    logger.info('Cleaning up test user', { email });

    // Find user by email
    const user = await db.getUserByEmail(email);

    if (!user) {
      // User doesn't exist, that's fine
      return NextResponse.json(
        { message: 'User not found (already cleaned up)', email },
        { status: 200 }
      );
    }

    // Delete user (this should cascade delete campaigns, sessions, etc. via Prisma)
    await db.deleteUser(user.id);

    logger.info('Test user cleaned up successfully', { email, userId: user.id });

    return NextResponse.json({
      message: 'User cleaned up successfully',
      email,
      userId: user.id,
    });

  } catch (error) {
    logger.error('Test cleanup error', error as Error);
    return NextResponse.json(
      { error: 'Failed to cleanup user' },
      { status: 500 }
    );
  }
}

