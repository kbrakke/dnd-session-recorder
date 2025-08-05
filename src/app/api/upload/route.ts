import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import { exec } from 'child_process';
import { requireAuth } from '@/lib/auth-utils';

import ffprobe from 'ffprobe-static';

// Configure upload settings
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '100000000'); // 100MB default

// Allowed audio file types
const allowedMimeTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/aac',
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
    const ffprobeBin = "./"+(ffprobe.path as string).substring(5);
    const command = `${ffprobeBin} -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
    const { stdout } = await execAsync(command);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? null : Math.round(duration);
  } catch (error) {
    console.error('Error getting audio duration:', error);
    return null;
  }
}

// POST /api/upload - Upload audio file
export async function POST(request: NextRequest) {
  try {
    // Check authentication first
    const { error } = await requireAuth();
    if (error) return error;

    await ensureUploadDir();
    
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
    const filePath = path.join(uploadDir, uniqueName);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    await writeFile(filePath, buffer);

    // Get audio duration
    const duration = await getAudioDuration(filePath);

    const fileInfo = {
      filename: uniqueName,
      originalName: file.name,
      path: filePath,
      size: file.size,
      mimetype: file.type,
      duration: duration,
      uploadedAt: new Date().toISOString()
    };

    console.log(`[Upload] File uploaded successfully: ${uniqueName}`);

    return NextResponse.json({
      message: 'File uploaded successfully',
      file: fileInfo
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}