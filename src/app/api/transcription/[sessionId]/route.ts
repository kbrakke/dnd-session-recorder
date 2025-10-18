import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { fileCleanup } from '@/services/fileCleanup';
import { experimental_transcribe as transcribe } from 'ai';
import { openai } from '@ai-sdk/openai';
import { isTestAccount } from '@/lib/whitelist';
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

// Helper to execute with timeout
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]);
}

// POST /api/transcription/[sessionId] - Transcribe audio
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // No need to read request body - all info comes from session
    await request.json().catch(() => ({})); // Read body to prevent stream errors

    // Check authentication and get user info
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    // COST PROTECTION: Block test accounts from making AI API calls
    if (isTestAccount(user.email!)) {
      console.log(`[Transcription] Blocked test account ${user.email} from making AI API call for session ${sessionId}`);

      return NextResponse.json(
        {
          error: 'Test accounts cannot use AI transcription services. Please use a real email address to access this feature.',
          isTestAccount: true
        },
        { status: 403 }
      );
    }

    // Check if session exists and has an upload linked
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // IDEMPOTENCY: Check if transcription already exists
    const existingTranscriptions = await db.getTranscriptions(sessionId);
    if (existingTranscriptions && existingTranscriptions.length > 0) {
      console.log(`[Transcription] Transcription already exists for session ${sessionId}, skipping`);

      // Update status to transcribed if not already
      if (session.status !== 'transcribed' && session.status !== 'completed') {
        await updateSessionStatus(sessionId, 'transcribed');
      }

      return NextResponse.json({
        message: 'Transcription already exists',
        transcriptionLength: existingTranscriptions[0].text.length,
        skipped: true
      });
    }

    // Get the file path from the linked upload
    if (!session.upload) {
      return NextResponse.json(
        { error: 'No audio file found for this session. Please upload an audio file first.' },
        { status: 400 }
      );
    }

    const fullPath = session.upload.path;

    if (!fs.existsSync(fullPath)) {
      console.log(`[Transcription] File not found at path: ${fullPath}, performing reconciliation`);
      
      // File reconciliation: Remove database references to missing files
      try {
        if (session.upload) {
          console.log(`[Transcription] Removing upload record ${session.upload.id} for missing file`);
          await db.deleteUpload(session.upload.id);
        }
        
        // Clear the session's upload link and revert to draft status
        await db.updateSession(sessionId, { 
          uploadId: null, 
          status: 'draft'
        });
        
        console.log(`[Transcription] Cleaned up database records for missing file`);
      } catch (cleanupError) {
        console.error('Error during file reconciliation cleanup:', cleanupError);
      }
      
      return NextResponse.json(
        { 
          error: `Audio file not found at path: ${fullPath}. Database records have been cleaned up. Please re-upload the file.`,
          fileReconciled: true
        },
        { status: 404 }
      );
    }

    console.log(`[Transcription] Starting transcription for session ${sessionId}`);

    // Start processing timer
    await db.startProcessing(sessionId);
    await updateSessionStatus(sessionId, 'transcribing');

    // Update progress: Starting chunking
    await db.updateTranscriptionProgress(sessionId, {
      currentStep: 'chunking',
      transcriptionProgress: 5,
    });

    // Split audio into 24MB chunks
    const chunkPaths = await splitAudioBySize(fullPath, 18);
    console.log(`[Transcription] Audio split into ${chunkPaths.length} chunk(s)`);
    
    // Update progress: Chunking complete, starting transcription
    await db.updateTranscriptionProgress(sessionId, {
      currentStep: 'transcribing',
      totalChunks: chunkPaths.length,
      chunksCompleted: 0,
      transcriptionProgress: 10,
    });

    const allText: string[] = [];
    
    // Set timeout for each chunk: 30 minutes per chunk
    const CHUNK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkPath = chunkPaths[i];
      console.log(`[Transcription] Transcribing chunk ${i + 1}/${chunkPaths.length}: ${chunkPath}`);

      try {
        // Read the file buffer for AI SDK
        const fileBuffer = fs.readFileSync(chunkPath);

        const transcription = await withTimeout(
          transcribe({
            model: openai.transcription('whisper-1'),
            audio: fileBuffer,
          }),
          CHUNK_TIMEOUT_MS,
          `Transcription timeout: Chunk ${i + 1}/${chunkPaths.length} took longer than 30 minutes`
        );

        if (!transcription.text) {
          throw new Error(`No transcription text received for chunk ${i + 1}`);
        }

        allText.push(transcription.text);
        console.log(`[Transcription] Chunk ${i + 1} transcribed successfully.`);

        // Update progress after each chunk
        const progressPercentage = Math.floor(10 + ((i + 1) / chunkPaths.length) * 80); // 10-90% for transcription
        await db.updateTranscriptionProgress(sessionId, {
          chunksCompleted: i + 1,
          transcriptionProgress: progressPercentage,
        });
      } catch (chunkError) {
        console.error(`[Transcription] Error on chunk ${i + 1}/${chunkPaths.length}:`, chunkError);

        // Clean up any chunks we created
        chunkPaths.forEach(p => {
          if (p !== fullPath && fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch (cleanupErr) {
              console.error(`[Transcription] Error cleaning up ${p}:`, cleanupErr);
            }
          }
        });

        throw new Error(
          `Failed to transcribe chunk ${i + 1}/${chunkPaths.length}: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`
        );
      }
    }
    
    // Update progress: Starting stitching
    await db.updateTranscriptionProgress(sessionId, {
      currentStep: 'stitching',
      transcriptionProgress: 90,
    });

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
    
    // Update progress: Complete
    await db.updateTranscriptionProgress(sessionId, {
      currentStep: 'completed',
      transcriptionProgress: 100,
    });

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

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');

    await db.setSessionError(
      sessionId,
      isTimeout ? 'transcription_timeout' : 'transcription',
      errorMessage
    );

    return NextResponse.json(
      {
        error: 'Failed to transcribe audio',
        details: errorMessage,
        isTimeout,
        canRetry: true,
      },
      { status: 500 }
    );
  }
}

// GET /api/transcription/[sessionId] - Get transcriptions for a session
export async function GET(
  _request: NextRequest,
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

// DELETE /api/transcription/[sessionId] - Cancel transcription
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // Check authentication
    const { error } = await requireAuth();
    if (error) return error;

    // Check if session exists
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if processing has been running for more than 30 minutes
    const { isTimedOut, minutesElapsed } = await db.checkProcessingTimeout(sessionId, 30);

    // Cancel the transcription by resetting the session state
    await db.cancelTranscription(sessionId);

    console.log(`[Transcription] Cancelled for session ${sessionId} (${minutesElapsed} minutes elapsed, timeout: ${isTimedOut})`);

    return NextResponse.json({
      message: 'Transcription cancelled successfully',
      wasTimedOut: isTimedOut,
      minutesElapsed,
    });
  } catch (error) {
    console.error('Error cancelling transcription:', error);

    return NextResponse.json(
      { error: 'Failed to cancel transcription' },
      { status: 500 }
    );
  }
}