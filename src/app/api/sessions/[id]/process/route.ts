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
    // Check authentication
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    // Get current session state
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    logger.info('Starting processing pipeline', {
      sessionId,
      status: session.status
    });

    // If session is already completed, return current state
    if (session.status === 'completed') {
      return NextResponse.json({
        message: 'Session already completed',
        status: 'completed',
        session
      });
    }

    // If currently processing (not stopped), return current state
    if (['transcribing', 'summarizing'].includes(session.status)) {
      // Check if it's actually stuck (processing started more than 30 min ago)
      const { isTimedOut } = await db.checkProcessingTimeout(sessionId, 30);

      if (!isTimedOut) {
        return NextResponse.json({
          message: 'Session is currently being processed',
          status: session.status,
          session
        });
      }

      // If timed out, allow restart
      logger.warn('Session processing timed out, allowing restart', {
        sessionId,
        status: session.status
      });
    }

    // Check if session has an upload
    if (!session.uploadId) {
      return NextResponse.json({
        error: 'Session has no audio file linked. Please upload an audio file first.',
        status: 'draft',
        needsUpload: true
      }, { status: 400 });
    }

    // Verify upload exists
    const upload = await db.getUploadById(session.uploadId);
    if (!upload) {
      return NextResponse.json({
        error: 'Audio file not found. Please upload an audio file.',
        status: 'draft',
        needsUpload: true
      }, { status: 400 });
    }

    // Check transcription status
    const transcriptions = await db.getTranscriptions(sessionId);
    const hasTranscription = transcriptions && transcriptions.length > 0;

    // Step 1: Trigger transcription if needed
    if (!hasTranscription) {
      logger.info('Triggering transcription', { sessionId });

      // Update status to transcribing
      await db.updateSession(sessionId, { status: 'transcribing' });

      // Trigger transcription asynchronously (fire and forget)
      // Forward the cookies from the original request
      const cookieHeader = request.headers.get('cookie');
      fetch(`${request.nextUrl.origin}/api/transcription/${sessionId}`, {
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
      const cookieHeader = request.headers.get('cookie');
      fetch(`${request.nextUrl.origin}/api/summary/${sessionId}`, {
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
