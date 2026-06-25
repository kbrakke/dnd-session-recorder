import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { saveAudio, buildAudioKey } from '@/services/storage';
import { probeAudioDurationSeconds } from '@/services/audioProcessing';
import { isAllowedMime } from '@/lib/uploadValidation';
import { logger } from '@/lib/logger';

const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '100000000'); // 100MB default

// POST /api/uploads - Upload audio file and create Upload record
export async function POST(request: NextRequest) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get('audio') as File;

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    if (!isAllowedMime(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only audio files are allowed.' },
        { status: 400 }
      );
    }

    if (file.size > maxFileSize) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    const extension = path.extname(file.name);
    const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Probe duration from a temp file, then persist to the storage backend
    // (Tigris object storage in production, local UPLOAD_DIR in dev).
    const probeDir = path.join(os.tmpdir(), 'dnd-audio-probe');
    await mkdir(probeDir, { recursive: true });
    const probePath = path.join(probeDir, uniqueName);
    await writeFile(probePath, buffer);
    const duration = await probeAudioDurationSeconds(probePath);
    await unlink(probePath).catch(() => {});

    const key = buildAudioKey(user.id, uniqueName);
    await saveAudio(key, buffer, file.type);

    const upload = await db.createUpload({
      userId: user.id,
      filename: uniqueName,
      originalName: file.name,
      storageKey: key,
      size: file.size,
      mimetype: file.type,
      duration: duration ?? undefined,
    });

    logger.info('File uploaded successfully', {
      filename: uniqueName,
      uploadId: upload.id,
      userId: user.id
    });

    return NextResponse.json({
      message: 'File uploaded successfully',
      upload: {
        id: upload.id,
        filename: upload.filename,
        originalName: upload.originalName,
        size: upload.size,
        mimetype: upload.mimetype,
        duration: upload.duration,
        status: upload.status,
        createdAt: upload.createdAt,
      }
    });

  } catch (error) {
    logger.error('Upload error', error as Error);

    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

// GET /api/uploads - Get user's uploads
export async function GET(request: NextRequest) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const includeSessions = new URL(request.url).searchParams.get('includeSessions') === 'true';
    const uploads = await db.getUploads(user.id, includeSessions);

    return NextResponse.json({
      uploads: uploads.map(upload => ({
        id: upload.id,
        filename: upload.filename,
        originalName: upload.originalName,
        size: upload.size,
        mimetype: upload.mimetype,
        duration: upload.duration,
        status: upload.status,
        createdAt: upload.createdAt,
        updatedAt: upload.updatedAt,
      })),
    });
  } catch (error) {
    logger.error('Failed to get uploads', error as Error);
    return NextResponse.json({ error: 'Failed to get uploads' }, { status: 500 });
  }
}