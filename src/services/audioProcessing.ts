import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import ffprobe from 'ffprobe-static';
import { logger } from '@/lib/logger';

const execFileAsync = promisify(execFile);

export interface AudioChunk {
  path: string;
  index: number;
  sizeBytes: number;
}

export interface SplitOptions {
  /** Max chunk size in MB. Defaults to 24 (just under Whisper's 25MB limit). */
  maxChunkSizeMB?: number;
  /** Output directory for chunks. Defaults to same directory as input file. */
  outputDir?: string;
}

/**
 * Get audio file duration in seconds using FFmpeg.
 */
export function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe audio file: ${err.message}`));
        return;
      }

      const duration = metadata.format.duration;
      if (!duration) {
        reject(new Error('Could not determine audio duration'));
        return;
      }

      resolve(duration);
    });
  });
}

/**
 * Create a single audio chunk using FFmpeg.
 */
function createChunk(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
}

/**
 * Split an audio file into chunks by size.
 *
 * Uses FFmpeg to split audio files into approximately equal chunks
 * based on duration proportional to file size. Chunks are created
 * in parallel for speed.
 *
 * @returns Array of chunk information including paths, indices, and sizes
 * @throws If the input file doesn't exist or FFmpeg fails
 */
export async function splitAudioBySize(
  inputPath: string,
  options: SplitOptions = {}
): Promise<AudioChunk[]> {
  const {
    maxChunkSizeMB = 24,
    outputDir = path.dirname(inputPath),
  } = options;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Audio file not found: ${inputPath}`);
  }

  const stats = fs.statSync(inputPath);
  const totalSize = stats.size;
  const chunkSizeBytes = maxChunkSizeMB * 1024 * 1024;
  const numChunks = Math.ceil(totalSize / chunkSizeBytes);

  if (numChunks === 1) {
    logger.debug('Audio file under size limit, no split needed', {
      maxChunkSizeMB,
      path: inputPath,
    });
    return [{ path: inputPath, index: 0, sizeBytes: totalSize }];
  }

  const duration = await getAudioDuration(inputPath);
  const chunkDuration = duration / numChunks;
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);

  logger.info('Splitting audio file into chunks', {
    path: inputPath,
    numChunks,
    maxChunkSizeMB,
    chunkDuration: chunkDuration.toFixed(2),
  });

  // Create all chunks in parallel (matching existing behavior)
  const chunkInfos: { outputPath: string; index: number }[] = [];
  const splitPromises: Promise<void>[] = [];

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkDuration;
    const outputPath = path.join(outputDir, `${base}_chunk${i}${ext}`);
    chunkInfos.push({ outputPath, index: i });

    splitPromises.push(createChunk(inputPath, outputPath, start, chunkDuration));
  }

  await Promise.all(splitPromises);

  // Gather chunk metadata
  const chunks: AudioChunk[] = chunkInfos.map(({ outputPath, index }) => {
    const chunkStats = fs.statSync(outputPath);
    logger.debug('Audio chunk created', { output: outputPath });
    return {
      path: outputPath,
      index,
      sizeBytes: chunkStats.size,
    };
  });

  return chunks;
}

/**
 * Clean up chunk files, skipping the original input file.
 */
export function cleanupChunkFiles(chunkPaths: string[], originalPath: string): void {
  for (const p of chunkPaths) {
    if (p !== originalPath && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (err) {
        logger.error('Chunk cleanup failed', err as Error, { path: p });
      }
    }
  }
}

/**
 * Validate an audio file exists and extract metadata.
 */
export async function validateAudioFile(filePath: string): Promise<{
  isValid: boolean;
  error?: string;
  metadata?: {
    duration: number;
    format: string;
    sizeBytes: number;
  };
}> {
  try {
    if (!fs.existsSync(filePath)) {
      return { isValid: false, error: 'File not found' };
    }

    const stats = fs.statSync(filePath);
    const duration = await getAudioDuration(filePath);

    const format = await new Promise<string>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.format_name || 'unknown');
      });
    });

    return {
      isValid: true,
      metadata: {
        duration,
        format,
        sizeBytes: stats.size,
      },
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Probe an audio file's duration in whole seconds, returning null on failure.
 *
 * Uses execFile with argument arrays (never a shell string) so user-controlled
 * filenames can't inject shell commands. Prefers the system ffprobe in
 * production and the bundled ffprobe-static binary elsewhere.
 */
export async function probeAudioDurationSeconds(filePath: string): Promise<number | null> {
  const ffprobeBin = process.env.NODE_ENV === 'production' ? 'ffprobe' : (ffprobe.path as string);
  try {
    const { stdout } = await execFileAsync(ffprobeBin, [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? null : Math.round(duration);
  } catch (error) {
    logger.error('Failed to get audio duration', error as Error);
    return null;
  }
}
