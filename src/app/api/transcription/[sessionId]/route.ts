import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/services/database';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { File } from 'node:buffer';

// Polyfill for Node.js File API compatibility with OpenAI SDK
if (typeof globalThis.File === 'undefined') {
  globalThis.File = File;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    await db.updateSession(parseInt(sessionId), {
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

    if (!audioFilePath) {
      return NextResponse.json(
        { error: 'Audio file path is required' },
        { status: 400 }
      );
    }

    // Check if session exists
    const session = await db.getSessionById(parseInt(sessionId));
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const fullPath = path.resolve(audioFilePath);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json(
        { error: 'Audio file not found' },
        { status: 404 }
      );
    }

    console.log(`[Transcription] Starting transcription for session ${sessionId}`);
    await updateSessionStatus(sessionId, 'processing');

    // Split audio into 24MB chunks
    const chunkPaths = await splitAudioBySize(fullPath, 24);
    console.log(`[Transcription] Audio split into ${chunkPaths.length} chunk(s)`);

    let allSegments: Array<{
      start: number;
      end: number;
      text: string;
      avg_logprob?: number;
    }> = [];
    
    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkPath = chunkPaths[i];
      console.log(`[Transcription] Transcribing chunk ${i + 1}/${chunkPaths.length}: ${chunkPath}`);
      
      // Read the file and create a proper File object
      const fileBuffer = fs.readFileSync(chunkPath);
      const fileName = path.basename(chunkPath);
      const file = new File([fileBuffer], fileName, { type: 'audio/mpeg' });
      
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment'],
      });

      if (!transcription.segments) {
        throw new Error(`No transcription segments received for chunk ${i + 1}`);
      }

      // Offset segment times for all but the first chunk
      if (i > 0) {
        const prevDuration = allSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
        transcription.segments.forEach(seg => {
          seg.start += prevDuration;
          seg.end += prevDuration;
        });
      }

      allSegments = allSegments.concat(transcription.segments);
      console.log(`[Transcription] Chunk ${i + 1} transcribed, ${transcription.segments.length} segments.`);
    }

    // Clean up chunk files (except original)
    chunkPaths.forEach(p => {
      if (p !== fullPath && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    });
    console.log(`[Transcription] All chunks transcribed and cleaned up.`);

    // Save transcriptions to database
    await db.saveTranscriptions(parseInt(sessionId), allSegments);
    console.log(`[Transcription] Transcriptions saved.`);

    await updateSessionStatus(sessionId, 'completed');
    console.log(`[Transcription] Transcription completed for session ${sessionId}`);

    return NextResponse.json({
      message: 'Transcription completed successfully',
      transcriptionCount: allSegments.length
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
    const transcriptions = await db.getTranscriptions(parseInt(sessionId));
    
    return NextResponse.json(transcriptions);
  } catch (error) {
    console.error('Error fetching transcriptions:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch transcriptions' },
      { status: 500 }
    );
  }
}