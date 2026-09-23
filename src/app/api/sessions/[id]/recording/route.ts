import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthForSensitiveAction } from '@/lib/auth-utils';
import { notFound, recordingError, recordingValidationError } from '@/lib/route-utils';
import { db } from '@/services/database';
import { getLatestJob } from '@/services/pipeline/queue';
import { getRecordingState, startOrTakeoverRecording } from '@/services/recording';
import { logger } from '@/lib/logger';

const startRecordingSchema = z.object({
  mimeType: z
    .string()
    .max(100)
    .regex(/^audio\//)
    .optional()
    .default('audio/webm;codecs=opus'),
  force: z.boolean().optional(),
});

/**
 * POST /api/sessions/[id]/recording   body: { mimeType?, force? }
 *
 * Start recording this session live — or take the recording over (resume
 * after interruption, second tab). Both issue a fresh recorder token that
 * invalidates any other tab still capturing, so this is only ever called
 * from a user gesture. A LIVE recording (fresh heartbeat) needs `force: true`
 * (409 code 'still_capturing' otherwise). 409 'has_audio' once the session
 * has audio; 409 'past_capture' once the recording left the capture phase or
 * the session has other pipeline work.
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
    return recordingError(409, 'has_audio', 'Session already has audio attached');
  }
  // A draft that already has transcripts (upload unlinked after an error),
  // or an active pipeline job, would make finalize's per-session enqueue
  // return the wrong job and strand the recording in 'finalizing'.
  if (session.transcriptions.length > 0) {
    return recordingError(409, 'past_capture', 'Session already has a transcript');
  }
  const latestJob = await getLatestJob(id);
  if (latestJob && (latestJob.status === 'pending' || latestJob.status === 'running')) {
    return recordingError(409, 'past_capture', 'Session has processing in progress');
  }

  let body: z.infer<typeof startRecordingSchema>;
  try {
    body = startRecordingSchema.parse(await request.json().catch(() => ({})));
  } catch (parseError) {
    const validation = recordingValidationError(parseError);
    if (validation) return validation;
    throw parseError;
  }

  const result = await startOrTakeoverRecording(id, user.id, body.mimeType, {
    force: body.force,
  });
  if (result.kind === 'past_capture') {
    return recordingError(409, 'past_capture', 'Recording is already being finalized');
  }
  if (result.kind === 'still_capturing') {
    return recordingError(409, 'still_capturing', 'Recording is still capturing', {
      lastHeartbeatAt: result.lastHeartbeatAt,
    });
  }

  logger.info('Live recording started or taken over', {
    sessionId: id,
    userId: user.id,
    recordingId: result.recording.id,
    forced: !!body.force,
  });

  return NextResponse.json({
    recording: await getRecordingState(result.recording),
    recorderToken: result.recorderToken,
    nextSegmentIndex: result.nextSegmentIndex,
  });
}
