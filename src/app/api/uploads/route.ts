import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import { exec } from 'child_process';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { saveAudio, buildAudioKey, audioExists } from '@/services/storage';
import { logger } from '@/lib/logger';

import ffprobe from 'ffprobe-static';

// Configure upload settings
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

// Get audio duration using ffprobe
async function getAudioDuration(filePath: string): Promise<number | null> {
  try {
    const execAsync = promisify(exec);
    // Use system ffprobe in production, fallback to ffprobe-static in development
    const ffprobeBin = process.env.NODE_ENV === 'production' 
      ? 'ffprobe'  // Use system-installed ffprobe in production
      : ffprobe.path as string;  // Use ffprobe-static in development
    const command = `${ffprobeBin} -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
    const { stdout } = await execAsync(command);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? null : Math.round(duration);
  } catch (error) {
    logger.error('Failed to get audio duration', error as Error);
    return null;
  }
}

// POST /api/uploads - Upload audio file and create Upload record
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get('audio') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only audio files are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > maxFileSize) {
      return NextResponse.json(
        { error: 'File too large' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const extension = path.extname(file.name);
    const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Probe duration from a temp file, then persist to the storage backend
    // (Tigris object storage in production, local UPLOAD_DIR in dev).
    const probeDir = path.join(os.tmpdir(), 'dnd-audio-probe');
    await mkdir(probeDir, { recursive: true });
    const probePath = path.join(probeDir, uniqueName);
    await writeFile(probePath, buffer);
    const duration = await getAudioDuration(probePath);
    await unlink(probePath).catch(() => {});

    const key = buildAudioKey(user.id, uniqueName);
    const { localPath } = await saveAudio(key, buffer, file.type);

    // Create Upload record in database
    const upload = await db.createUpload({
      userId: user.id,
      filename: uniqueName,
      originalName: file.name,
      path: localPath ?? key,
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
    // Check authentication
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    // Check if we should include session associations
    const { searchParams } = new URL(request.url);
    const includeSessions = searchParams.get('includeSessions') === 'true';

    const uploads = await db.getUploads(user.id, includeSessions);

    // File reconciliation applies ONLY to legacy local-disk uploads (no
    // storageKey). Object-storage uploads are durable; never disk-check or
    // auto-delete them here.
    const validUploads = [];
    const invalidUploadIds = [];

    for (const upload of uploads) {
      if (upload.storageKey || (await audioExists(upload))) {
        validUploads.push(upload);
      } else {
        logger.warn('File not found for legacy upload', {
          uploadId: upload.id,
          path: upload.path
        });
        invalidUploadIds.push(upload.id);
      }
    }

    // Clean up database records for missing files
    if (invalidUploadIds.length > 0) {
      logger.info('Cleaning up upload records with missing files', {
        count: invalidUploadIds.length
      });
      try {
        for (const uploadId of invalidUploadIds) {
          await db.deleteUpload(uploadId);
        }
      } catch (cleanupError) {
        logger.error('Failed to clean up invalid uploads', cleanupError as Error);
      }
    }
    
    return NextResponse.json({
      uploads: validUploads.map(upload => ({
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
      reconciledCount: invalidUploadIds.length
    });

  } catch (error) {
    logger.error('Failed to get uploads', error as Error);

    return NextResponse.json(
      { error: 'Failed to get uploads' },
      { status: 500 }
    );
  }
}