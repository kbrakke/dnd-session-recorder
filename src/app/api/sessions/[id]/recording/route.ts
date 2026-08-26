import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthForSensitiveAction } from '@/lib/auth-utils';
import { notFound, zodErrorResponse } from '@/lib/route-utils';
import { db } from '@/services/database';
import { getRecordingState, startOrTakeoverRecording } from '@/services/recording';
import { logger } from '@/lib/logger';

const startRecordingSchema = z.object({
  mimeType: z
    .string()
    .max(100)
    .regex(/^audio\//)
    .optional()
    .default('audio/webm;codecs=opus'),
});

/**
 * POST /api/sessions/[id]/recording
 *
 * Start recording this session live — or take the recording over (resume
 * after interruption, second tab). Both issue a fresh recorder token that
 * invalidates any other tab still capturing. 409 once the recording is past
 * the capture phase (finalizing/finalized/failed) or the session already
 * has audio.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAuthForSensitiveAction(request);
  if (error) return error;

  const { id } = await params;
  const session = await db.getSessionById(id);
  if (!session || session.userId !== user.id) {
    return notFound('Session not found');
  }
  if (session.uploadId) {
    return NextResponse.json(
      { error: 'Session already has audio attached' },
      { status: 409 }
    );
  }

  let body: z.infer<typeof startRecordingSchema>;
  try {
    body = startRecordingSchema.parse(await request.json().catch(() => ({})));
  } catch (parseError) {
    const zodError = zodErrorResponse(parseError);
    if (zodError) return zodError;
    throw parseError;
  }

  const result = await startOrTakeoverRecording(id, user.id, body.mimeType);
  if (result === 'conflict') {
    return NextResponse.json(
      { error: 'Recording is already being finalized' },
      { status: 409 }
    );
  }

  logger.info('Live recording started or taken over', {
    sessionId: id,
    userId: user.id,
    recordingId: result.recording.id,
  });

  return NextResponse.json({
    recording: await getRecordingState(result.recording),
    recorderToken: result.recorderToken,
    nextSegmentIndex: result.nextSegmentIndex,
  });
}
