import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { isAiMocked } from '@/lib/ai';
import { isTestAccount } from '@/lib/whitelist';
import { enqueueProcessSession } from '@/services/pipeline/queue';
import { saveAudio, buildAudioKey } from '@/services/storage';
import { probeAudioDurationSeconds } from '@/services/audioProcessing';
import { logger, getUserContext } from '@/lib/logger';

const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '100000000'); // 100MB default

const allowedMimeTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/x-aac',
  'audio/flac',
  'audio/webm'
];

/**
 * POST /api/sessions/create-with-upload
 *
 * Atomic session creation with upload:
 * 1. Validates campaign ownership
 * 2. Uploads audio file
 * 3. Creates session with upload linked
 * 4. Triggers processing pipeline
 *
 * This is a single atomic operation that ensures consistency.
 */
export async function POST(request: NextRequest) {
  let createdSessionId: string | null = null;

  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    logger.apiRequest('POST', '/api/sessions/create-with-upload', getUserContext({ user }));

    const formData = await request.formData();

    // Extract form fields
    const title = formData.get('title') as string;
    const campaignId = formData.get('campaign_id') as string;
    const sessionDate = formData.get('session_date') as string;
    const audioFile = formData.get('audio') as File | null;

    // Validate required fields
    if (!title || !campaignId || !sessionDate) {
      return NextResponse.json(
        { error: 'Missing required fields: title, campaign_id, session_date' },
        { status: 400 }
      );
    }

    // Verify campaign exists and belongs to user
    const campaign = await db.getCampaignById(campaignId);
    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    let uploadId: string | undefined;
    let duration: number | undefined;

    // Handle audio upload if provided
    if (audioFile) {
      // Validate file type
      if (!allowedMimeTypes.includes(audioFile.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Only audio files are allowed.' },
          { status: 400 }
        );
      }

      // Validate file size
      if (audioFile.size > maxFileSize) {
        return NextResponse.json(
          { error: `File too large. Maximum size is ${maxFileSize / 1000000}MB` },
          { status: 400 }
        );
      }

      // Generate unique filename, probe duration, persist to storage backend
      const extension = path.extname(audioFile.name);
      const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;

      const bytes = await audioFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const probeDir = path.join(os.tmpdir(), 'dnd-audio-probe');
      await mkdir(probeDir, { recursive: true });
      const probePath = path.join(probeDir, uniqueName);
      await writeFile(probePath, buffer);
      duration = await probeAudioDurationSeconds(probePath) ?? undefined;
      await unlink(probePath).catch(() => {});

      const key = buildAudioKey(user.id, uniqueName);
      await saveAudio(key, buffer, audioFile.type);

      logger.info('Audio file saved for session creation', {
        filename: uniqueName,
        storageKey: key,
        size: audioFile.size,
        userId: user.id
      });

      const upload = await db.createUpload({
        userId: user.id,
        filename: uniqueName,
        originalName: audioFile.name,
        storageKey: key,
        size: audioFile.size,
        mimetype: audioFile.type,
        duration,
      });

      uploadId = upload.id;
      logger.info('Upload record created', {
        uploadId: upload.id,
        userId: user.id
      });
    }

    // Create gaming session (with or without upload)
    const session = await db.createSession({
      userId: user.id,
      campaignId,
      title,
      sessionDate: new Date(sessionDate),
      uploadId,
      duration,
      status: uploadId ? 'uploaded' : 'draft',
    });

    createdSessionId = session.id;
    logger.info('Session created', {
      sessionId: session.id,
      campaignId,
      uploadId,
      status: session.status,
      userId: user.id
    });

    // If audio was uploaded, enqueue the durable processing pipeline.
    // COST PROTECTION: test accounts don't auto-enqueue unless AI is mocked.
    if (uploadId && (!isTestAccount(user.email!) || isAiMocked())) {
      const { job } = await enqueueProcessSession(session.id);
      await db.updateSession(session.id, { status: 'transcribing' });

      logger.info('Processing job enqueued', {
        sessionId: session.id,
        jobId: job.id,
        userId: user.id
      });
    }

    return NextResponse.json({
      message: 'Session created successfully',
      session: {
        id: session.id,
        title: session.title,
        campaignId: session.campaignId,
        sessionDate: session.sessionDate,
        uploadId: session.uploadId,
        duration: session.duration,
        status: session.status,
        createdAt: session.createdAt,
      }
    }, { status: 201 });

  } catch (error) {
    logger.apiError('POST', '/api/sessions/create-with-upload', error as Error, {
      sessionId: createdSessionId ?? undefined
    });

    // If we have a session ID, return it so user can navigate to it
    if (createdSessionId) {
      return NextResponse.json({
        error: 'Session created but encountered an error during setup',
        sessionId: createdSessionId,
        message: 'You can continue from the session page'
      }, { status: 207 }); // 207 Multi-Status
    }

    return NextResponse.json(
      { error: 'Failed to create session', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
