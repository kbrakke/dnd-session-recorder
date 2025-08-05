import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { fileCleanup } from '@/services/fileCleanup';
import { experimental_transcribe as transcribe } from 'ai';
import { openai } from '@ai-sdk/openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

// Helper to split audio into 24MB chunks
async function splitAudioBySize(inputPath: string, chunkSizeMB = 24): Promise<string[]> {
  const stats = fs.statSync(inputPath);
  const totalSize = stats.size;
  const chunkSize = chunkSizeMB * 1024 * 1024;
  const numChunks = Math.ceil(totalSize / chunkSize);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const chunkPaths: string[] = [];

  if (numChunks === 1) {
    console.log(`[Audio Split] File is under ${chunkSizeMB}MB, no split needed.`);
    return [inputPath];
  }

  // Get duration of the audio
  const getDuration = () => new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
  
  const duration = await getDuration();
  const chunkDuration = duration / numChunks;

  console.log(`[Audio Split] Splitting ${inputPath} into ${numChunks} chunks of ~${chunkSizeMB}MB each (~${chunkDuration.toFixed(2)}s per chunk)`);

  const splitPromises: Promise<void>[] = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkDuration;
    const output = path.join(dir, `${base}_chunk${i}${ext}`);
    chunkPaths.push(output);
    
    splitPromises.push(new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(start)
        .setDuration(chunkDuration)
        .output(output)
        .on('end', () => {
          console.log(`[Audio Split] Created chunk: ${output}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[Audio Split] Error creating chunk ${output}:`, err);
          reject(err);
        })
        .run();
    }));
  }
  
  await Promise.all(splitPromises);
  return chunkPaths;
}

// Helper to update session status
async function updateSessionStatus(sessionId: string, status: string, errorStep?: string, errorMessage?: string): Promise<void> {
  try {
    await db.updateSession(sessionId, {
      status,
      errorStep: errorStep || null,
      errorMessage: errorMessage || null,
    });
  } catch (error) {
    console.error('Error updating session status:', error);
    throw error;
  }
}

// POST /api/transcription/[sessionId] - Transcribe audio
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  
  try {
    const body = await request.json();
    const { audioFilePath } = body;

    // Check if session exists
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    let fullPath: string;
    
    // If audioFilePath is provided, use it (backwards compatibility)
    if (audioFilePath) {
      fullPath = path.resolve(audioFilePath);
    } 
    // Otherwise, get the file path from the linked upload
    else if (session.upload) {
      fullPath = path.resolve(session.upload.path);
    } 
    // Fallback to session's audioFilePath if it exists
    else if (session.audioFilePath) {
      fullPath = path.resolve(session.audioFilePath);
    } 
    else {
      return NextResponse.json(
        { error: 'No audio file found for this session' },
        { status: 400 }
      );
    }

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json(
        { error: `Audio file not found at path: ${fullPath}` },
        { status: 404 }
      );
    }

    console.log(`[Transcription] Starting transcription for session ${sessionId}`);
    await updateSessionStatus(sessionId, 'transcribing');

    // Split audio into 24MB chunks
    const chunkPaths = await splitAudioBySize(fullPath, 18);
    console.log(`[Transcription] Audio split into ${chunkPaths.length} chunk(s)`);

    const allText: string[] = [];
    
    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkPath = chunkPaths[i];
      console.log(`[Transcription] Transcribing chunk ${i + 1}/${chunkPaths.length}: ${chunkPath}`);
      
      // Read the file buffer for AI SDK
      const fileBuffer = fs.readFileSync(chunkPath);
      
      const transcription = await transcribe({
        model: openai.transcription('whisper-1'),
        audio: fileBuffer,
      });

      if (!transcription.text) {
        throw new Error(`No transcription text received for chunk ${i + 1}`);
      }

      allText.push(transcription.text);
      console.log(`[Transcription] Chunk ${i + 1} transcribed.`);
    }

    // Clean up chunk files (except original)
    chunkPaths.forEach(p => {
      if (p !== fullPath && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    });
    console.log(`[Transcription] All chunks transcribed and cleaned up.`);

    // Combine all text chunks into a single transcription
    const fullText = allText.join(' ');

    // Save transcription to database
    await db.saveTranscription(sessionId, fullText);
    console.log(`[Transcription] Transcription saved.`);

    // Update session status to transcribed
    await updateSessionStatus(sessionId, 'transcribed');
    
    // Update upload status to transcribed if session has an upload
    if (session.uploadId) {
      await db.updateUploadStatus(session.uploadId, 'transcribed', chunkPaths);
    }

    // Clean up files after transcription is complete
    try {
      await fileCleanup.cleanupSessionFiles(sessionId);
    } catch (cleanupError) {
      console.warn(`[Transcription] File cleanup failed for session ${sessionId}:`, cleanupError);
      // Don't fail the transcription if cleanup fails
    }

    console.log(`[Transcription] Transcription completed for session ${sessionId}`);

    return NextResponse.json({
      message: 'Transcription completed successfully',
      transcriptionLength: fullText.length
    });

  } catch (error) {
    console.error('[Transcription Error]:', error);
    await updateSessionStatus(
      sessionId, 
      'error', 
      'transcription', 
      error instanceof Error ? error.message : String(error)
    );
    
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}

// GET /api/transcription/[sessionId] - Get transcriptions for a session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  
  try {
    // Check authentication
    const { error } = await requireAuth();
    if (error) return error;

    const transcriptions = await db.getTranscriptions(sessionId);
    
    return NextResponse.json(transcriptions);
  } catch (error) {
    console.error('Error fetching transcriptions:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch transcriptions' },
      { status: 500 }
    );
  }
}