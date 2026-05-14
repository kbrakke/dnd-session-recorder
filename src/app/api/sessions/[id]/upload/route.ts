import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { logger } from '@/lib/logger';

const linkUploadSchema = z.object({
  upload_id: z.string().min(1, 'Upload ID is required'),
  duration: z.number().nullable().optional(),
});

// POST /api/sessions/[id]/upload - Link upload to session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionId = (await params).id;
  const context = { sessionId };

  try {
    logger.apiRequest('POST', `/api/sessions/${sessionId}/upload`, context);

    const { error: authError, user } = await requireAuth();
    if (authError) {
      logger.warn('Unauthorized upload link attempt', context);
      return authError;
    }

    const userContext = { ...context, userId: user.id, userEmail: user.email };

    const body = await request.json();
    logger.debug('Link upload request body', { ...userContext, body });

    const validatedData = linkUploadSchema.parse(body);
    const uploadContext = { ...userContext, uploadId: validatedData.upload_id };

    // Verify session exists and belongs to user
    logger.debug('Fetching gaming session', uploadContext);
    const gamingSession = await db.getSessionById(sessionId);

    if (!gamingSession) {
      logger.warn('Gaming session not found', uploadContext);
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (gamingSession.userId !== user.id) {
      logger.warn('User does not own gaming session', { ...uploadContext, ownerId: gamingSession.userId });
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if session is in a state that allows upload linking
    if (['transcribing', 'transcribed', 'summarizing', 'completed'].includes(gamingSession.status)) {
      logger.warn('Cannot link upload - session already processing', { ...uploadContext, status: gamingSession.status });
      return NextResponse.json(
        { error: 'Cannot change upload after transcription has started', currentStatus: gamingSession.status },
        { status: 400 }
      );
    }

    // Verify upload exists and belongs to user
    logger.debug('Fetching upload', uploadContext);
    const upload = await db.getUploadById(validatedData.upload_id);

    if (!upload) {
      logger.warn('Upload not found', uploadContext);
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }

    if (upload.userId !== user.id) {
      logger.warn('User does not own upload', { ...uploadContext, uploadOwnerId: upload.userId });
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }

    // Link upload to session
    logger.info('Linking upload to session', uploadContext);
    const updatedSession = await db.linkSessionToUpload(sessionId, validatedData.upload_id);

    // Update session duration if provided
    if (validatedData.duration) {
      logger.debug('Updating session duration', { ...uploadContext, duration: validatedData.duration });
      await db.updateSession(sessionId, { duration: validatedData.duration });
    }

    logger.apiSuccess('POST', `/api/sessions/${sessionId}/upload`, 200, uploadContext);
    return NextResponse.json({
      message: 'Upload linked to session successfully',
      session: updatedSession
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Validation error linking upload', { ...context, validationErrors: error.issues });
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    logger.apiError('POST', `/api/sessions/${sessionId}/upload`, error as Error, context);
    return NextResponse.json(
      {
        error: 'Failed to link upload to session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/sessions/[id]/upload - Replace session's upload
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const body = await request.json();
    const validatedData = linkUploadSchema.parse(body);

    // Verify session exists and belongs to user
    const { id } = await params;
    const gamingSession = await db.getSessionById(id);
    if (!gamingSession || gamingSession.userId !== user.id) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if session is in a state that allows upload replacement
    if (['transcribing', 'transcribed', 'summarizing', 'completed'].includes(gamingSession.status)) {
      return NextResponse.json(
        { error: 'Cannot change upload after transcription has started' },
        { status: 400 }
      );
    }

    // Verify upload exists and belongs to user
    const upload = await db.getUploadById(validatedData.upload_id);
    if (!upload || upload.userId !== user.id) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }

    // Replace upload
    const updatedSession = await db.linkSessionToUpload(id, validatedData.upload_id);

    return NextResponse.json({
      message: 'Upload replaced successfully',
      session: updatedSession
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error replacing upload:', error);
    return NextResponse.json(
      { error: 'Failed to replace upload' },
      { status: 500 }
    );
  }
}

// DELETE /api/sessions/[id]/upload - Unlink upload from session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    // Verify session exists and belongs to user
    const { id } = await params;
    const gamingSession = await db.getSessionById(id);
    if (!gamingSession || gamingSession.userId !== user.id) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if session is in a state that allows upload unlinking
    if (['transcribing', 'transcribed', 'summarizing', 'completed'].includes(gamingSession.status)) {
      return NextResponse.json(
        { error: 'Cannot remove upload after transcription has started' },
        { status: 400 }
      );
    }

    // Unlink upload from session
    const updatedSession = await db.unlinkSessionFromUpload(id);

    return NextResponse.json({
      message: 'Upload unlinked from session successfully',
      session: updatedSession
    });

  } catch (error) {
    console.error('Error unlinking upload from session:', error);
    return NextResponse.json(
      { error: 'Failed to unlink upload from session' },
      { status: 500 }
    );
  }
}
