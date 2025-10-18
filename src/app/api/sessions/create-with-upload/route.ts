import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import { exec } from 'child_process';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import ffprobe from 'ffprobe-static';

// Configure upload settings
const uploadDir = process.env.UPLOAD_DIR || (process.env.NODE_ENV === 'production' ? '/app/data/uploads' : './uploads');
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '100000000'); // 100MB default

// Allowed audio file types
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

// Ensure upload directory exists
async function ensureUploadDir() {
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }
}

// Get audio duration using ffprobe
async function getAudioDuration(filePath: string): Promise<number | null> {
  try {
    const execAsync = promisify(exec);
    const ffprobeBin = process.env.NODE_ENV === 'production' ? 'ffprobe' : ffprobe.path as string;
    const command = `${ffprobeBin} -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
    const { stdout } = await execAsync(command);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? null : Math.round(duration);
  } catch (error) {
    console.error('Error getting audio duration:', error);
    return null;
  }
}

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
  let uploadedFilePath: string | null = null;
  let createdSessionId: string | null = null;

  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    await ensureUploadDir();

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

      // Generate unique filename and save file
      const extension = path.extname(audioFile.name);
      const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;
      uploadedFilePath = path.join(uploadDir, uniqueName);

      const bytes = await audioFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(uploadedFilePath, buffer);

      console.log(`[Session Creation] Audio file saved: ${uniqueName}`);

      // Get audio duration
      duration = await getAudioDuration(uploadedFilePath) ?? undefined;

      // Create upload record
      const upload = await db.createUpload({
        userId: user.id,
        filename: uniqueName,
        originalName: audioFile.name,
        path: uploadedFilePath,
        size: audioFile.size,
        mimetype: audioFile.type,
        duration,
      });

      uploadId = upload.id;
      console.log(`[Session Creation] Upload record created: ${upload.id}`);
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
    console.log(`[Session Creation] Session created: ${session.id}`);

    // If audio was uploaded, trigger processing pipeline
    if (uploadId) {
      // Fire and forget - don't wait for processing to complete
      // Forward cookies for authentication
      const cookieHeader = request.headers.get('cookie');
      fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/sessions/${session.id}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader && { 'Cookie': cookieHeader }),
        },
        // @ts-ignore - Node.js fetch signal timeout option
        signal: AbortSignal.timeout(60 * 60 * 1000), // 1 hour timeout
      }).catch(err => {
        // Ignore timeout errors - processing runs in background
        if (err.name !== 'TimeoutError' && err.code !== 'UND_ERR_HEADERS_TIMEOUT') {
          console.error('[Session Creation] Failed to trigger processing:', err);
        }
      });

      console.log(`[Session Creation] Processing pipeline triggered for session ${session.id}`);
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
    console.error('[Session Creation] Error:', error);

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
