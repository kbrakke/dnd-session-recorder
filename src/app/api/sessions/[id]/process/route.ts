import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { logger } from '@/lib/logger';

/**
 * POST /api/sessions/[id]/process
 *
 * Orchestrates the full processing pipeline for a session:
 * 1. Ensures upload is linked to session
 * 2. Triggers transcription (if not already done)
 * 3. Triggers summary generation (if transcription exists)
 *
 * This endpoint is idempotent and resumable - it checks the current state
 * and only performs necessary steps.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;


    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.userId !== user.id) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    logger.info('Starting processing pipeline', {
      sessionId,
      status: session.status
    });

    if (session.status === 'completed') {
      return NextResponse.json({
        message: 'Session already completed',
        status: 'completed',
        session
      });
    }

    if (['transcribing', 'summarizing'].includes(session.status)) {
      const { isTimedOut } = await db.checkProcessingTimeout(sessionId, 30);

      if (!isTimedOut) {
        return NextResponse.json({
          message: 'Session is currently being processed',
          status: session.status,
          session
        });
      }

      logger.warn('Session processing timed out, allowing restart', {
        sessionId,
        status: session.status
      });
    }

    if (!session.uploadId) {
      return NextResponse.json({
        error: 'Session has no audio file linked. Please upload an audio file first.',
        status: 'draft',
        needsUpload: true
      }, { status: 400 });
    }

    const upload = await db.getUploadById(session.uploadId);
    if (!upload) {
      return NextResponse.json({
        error: 'Audio file not found. Please upload an audio file.',
        status: 'draft',
        needsUpload: true
      }, { status: 400 });
    }

    const transcriptions = await db.getTranscriptions(sessionId);
    const hasTranscription = transcriptions && transcriptions.length > 0;

    if (!hasTranscription) {
      logger.info('Triggering transcription', { sessionId });

      await db.updateSession(sessionId, { status: 'transcribing' });

      const cookieHeader = request.headers.get('cookie');
      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
      fetch(`${baseUrl}/api/transcription/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader && { 'Cookie': cookieHeader }),
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(60 * 60 * 1000), // 1 hour timeout
      }).catch(err => {
        // Ignore timeout errors - transcription runs in background
        if (err.name !== 'TimeoutError' && err.code !== 'UND_ERR_HEADERS_TIMEOUT') {
          logger.error('Failed to trigger transcription', err, { sessionId });
        }
      });

      return NextResponse.json({
        message: 'Transcription started',
        status: 'transcribing',
        step: 'transcription',
        session: await db.getSessionById(sessionId)
      });
    }

    // Step 2: Check summary status
    const summary = await db.getSummary(sessionId);
    const hasSummary = !!summary;

    if (!hasSummary) {
      logger.info('Triggering summary generation', { sessionId });

      // Update status to summarizing
      await db.updateSession(sessionId, { status: 'summarizing' });

      // Trigger summary generation asynchronously
      // Use NEXTAUTH_URL to avoid Fly.io's 0.0.0.0:3000 issue with request.nextUrl.origin
      const cookieHeader = request.headers.get('cookie');
      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
      fetch(`${baseUrl}/api/summary/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader && { 'Cookie': cookieHeader }),
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(60 * 60 * 1000), // 1 hour timeout
      }).catch(err => {
        // Ignore timeout errors - summary generation runs in background
        if (err.name !== 'TimeoutError' && err.code !== 'UND_ERR_HEADERS_TIMEOUT') {
          logger.error('Failed to trigger summary generation', err, { sessionId });
        }
      });

      return NextResponse.json({
        message: 'Summary generation started',
        status: 'summarizing',
        step: 'summary',
        session: await db.getSessionById(sessionId)
      });
    }

    // If we got here, everything is complete
    await db.updateSession(sessionId, { status: 'completed' });

    return NextResponse.json({
      message: 'Session processing complete',
      status: 'completed',
      session: await db.getSessionById(sessionId)
    });

  } catch (error) {
    logger.error('Processing pipeline error', error as Error, { sessionId });

    // Update session to error state
    try {
      await db.updateSession(sessionId, {
        status: 'error',
        errorStep: 'processing',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    } catch (updateError) {
      logger.error('Failed to update session status', updateError as Error, { sessionId });
    }

    return NextResponse.json(
      { error: 'Failed to process session', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
