import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Recording } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { db } from '@/services/database';
import {
  buildAudioKey,
  saveAudio,
  downloadObjectToFile,
  deleteObjectByKey,
} from '@/services/storage';
import { ffprobeBinary, getAudioDuration, probeAudioDurationSeconds } from '@/services/audioProcessing';
import { baseMimeType, contiguousParts, extensionForMime } from '@/services/recording';
import { isTestAccount } from '@/lib/whitelist';
import { isAiMocked } from '@/lib/ai';
import { logger } from '@/lib/logger';
import { PermanentJobError } from '../errors';
import { StepContext, assertActive } from '../util';

const execFileAsync = promisify(execFile);

/**
 * Assemble a live recording's uploaded parts into a normal audio Upload,
 * link it to the session, and hand off to the existing process_session
 * pipeline. Runs on the durable worker (lease, reaper, retries).
 *
 * Idempotency: once an Upload exists, `finalizedUploadId` is set BEFORE the
 * session link, so any re-run after that point skips assembly and only
 * repeats the (idempotent) bookkeeping. Before that point a re-run simply
 * re-assembles from the parts, which still exist.
 *
 * "Finalize what we have": segments assemble from the contiguous prefix of
 * their parts, so an interrupted recording (or one with a lost upload)
 * yields all audio up to the first gap instead of failing.
 */
export interface FinalizeResult {
  /**
   * Whether the caller (the worker) should enqueue process_session once the
   * finalize job is COMPLETED. The enqueue cannot happen inside this step:
   * queue idempotency is per-session, so while this job is still 'running'
   * an enqueue would return this very job and the process job would never
   * be created.
   */
  enqueueProcessing: boolean;
}

export async function runFinalizeRecordingStep(
  sessionId: string,
  ctx: StepContext
): Promise<FinalizeResult> {
  const recording = await prisma.recording.findUnique({
    where: { sessionId },
    include: {
      segments: { orderBy: { index: 'asc' }, include: { parts: { orderBy: { index: 'asc' } } } },
      session: { select: { title: true } },
      user: { select: { email: true } },
    },
  });
  if (!recording) {
    throw new PermanentJobError('No recording exists for this session');
  }

  if (recording.finalizedUploadId) {
    return finishBookkeeping(sessionId, recording, recording.finalizedUploadId, null);
  }

  // Belt-and-braces against a job enqueued before a lost race (a takeover
  // that flipped the recording back to capturing): never assemble a
  // recording that is not in the finalizing state.
  if (recording.status !== 'finalizing') {
    throw new PermanentJobError(`Recording is no longer finalizing (status: ${recording.status})`);
  }

  const ext = extensionForMime(recording.mimeType);
  const workDir = path.join(os.tmpdir(), 'dnd-recording-work', recording.id);
  await fs.promises.mkdir(workDir, { recursive: true });

  try {
    // 1. Rebuild each segment by downloading its parts in order and
    //    appending the bytes (parts are raw byte ranges of one MediaRecorder
    //    stream — ordered concatenation restores a valid container).
    const segmentFiles: string[] = [];
    // Exactly the part rows assembled — finishBookkeeping deletes only these,
    // so a straggler that lands later is never silently deleted.
    const assembledPartIds: string[] = [];
    for (const segment of recording.segments) {
      assertActive(ctx);
      const usable = contiguousParts(segment.parts);
      if (usable.length < segment.parts.length) {
        logger.warn('Recording segment has a part gap; assembling contiguous prefix only', {
          recordingId: recording.id,
          segmentIndex: segment.index,
          usable: usable.length,
          total: segment.parts.length,
        });
      }
      if (usable.length === 0) continue;

      const segmentPath = path.join(workDir, `segment-${segment.index}${ext}`);
      await fs.promises.rm(segmentPath, { force: true }); // clean re-run
      for (const part of usable) {
        const partPath = path.join(workDir, `part-${segment.index}-${part.index}`);
        await downloadObjectToFile(part.storageKey, partPath);
        await fs.promises.appendFile(segmentPath, await fs.promises.readFile(partPath));
        await fs.promises.rm(partPath, { force: true });
        assembledPartIds.push(part.id);
      }
      segmentFiles.push(segmentPath);
    }

    if (segmentFiles.length === 0) {
      throw new PermanentJobError('Recording has no usable audio parts to assemble');
    }

    // 2. Always write the output through ffmpeg — even for one segment.
    //    MediaRecorder WebM has no Duration or Cues; a stream-copy remux
    //    makes the matroska muxer write both, so the file is seekable and
    //    ffprobe reports a duration. Segments stream-copy when their audio
    //    parameters match (the normal case) and re-encode when a mic swap
    //    changed channels or sample rate.
    assertActive(ctx);
    const assembledPath = path.join(workDir, `assembled${ext}`);
    if (segmentFiles.length === 1) {
      await execFileAsync('ffmpeg', [
        '-y', '-i', segmentFiles[0], '-map', '0:a', '-c', 'copy', assembledPath,
      ]);
    } else {
      const params = await Promise.all(segmentFiles.map(probeAudioParams));
      const listPath = path.join(workDir, 'concat.txt');
      await fs.promises.writeFile(
        listPath,
        segmentFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
      );
      if (canStreamCopyConcat(params)) {
        await execFileAsync('ffmpeg', [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', listPath,
          '-map', '0:a',
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          assembledPath,
        ]);
      } else {
        logger.warn('Recording segments differ in audio parameters; re-encoding', {
          recordingId: recording.id,
          params,
        });
        const inputs = segmentFiles.flatMap(f => ['-i', f]);
        const filter = `${segmentFiles.map((_, i) => `[${i}:a]`).join('')}concat=n=${segmentFiles.length}:v=0:a=1[a]`;
        await execFileAsync('ffmpeg', [
          '-y', ...inputs,
          '-filter_complex', filter,
          '-map', '[a]',
          '-ac', '1', '-c:a', 'libopus', '-b:a', '48k',
          assembledPath,
        ]);
      }
    }

    // 3. Probe duration (decode fallback handles MediaRecorder WebM's
    //    missing container duration) and publish as a normal Upload.
    const duration = await probeDurationWithFallback(assembledPath);
    const buffer = await fs.promises.readFile(assembledPath);
    const mimetype = baseMimeType(recording.mimeType);
    const uniqueName = `${Date.now()}-${randomUUID()}${ext}`;
    const storageKey = buildAudioKey(recording.userId, uniqueName);

    assertActive(ctx);
    await saveAudio(storageKey, buffer, mimetype);
    const upload = await db.createUpload({
      userId: recording.userId,
      filename: uniqueName,
      originalName: `${recording.session.title || 'live-recording'}${ext}`,
      storageKey,
      size: buffer.length,
      mimetype,
      duration: duration ?? undefined,
    });

    // Recovery pointer BEFORE the remaining bookkeeping: a crash after this
    // line re-runs into the finishBookkeeping path, never a second Upload.
    await prisma.recording.update({
      where: { id: recording.id },
      data: { finalizedUploadId: upload.id },
    });

    const result = await finishBookkeeping(sessionId, recording, upload.id, assembledPartIds);
    logger.info('Recording finalized', {
      recordingId: recording.id,
      sessionId,
      uploadId: upload.id,
      sizeBytes: buffer.length,
      durationSeconds: duration,
      segments: segmentFiles.length,
    });
    return result;
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Everything after the Upload exists, all idempotent: link the session
 * (status -> 'uploaded', duration mirrored from the upload as in
 * create-with-upload), mark the recording finalized, and drop part objects
 * and rows. Whether to enqueue transcription (the create-with-upload
 * test-account cost gate) is RETURNED, not done here — see FinalizeResult.
 */
async function finishBookkeeping(
  sessionId: string,
  recording: Recording & { user: { email: string | null } },
  uploadId: string,
  assembledPartIds: string[] | null
): Promise<FinalizeResult> {
  await db.linkSessionToUpload(sessionId, uploadId);
  const upload = await db.getUploadById(uploadId);
  if (upload?.duration != null) {
    await db.updateSession(sessionId, { duration: upload.duration });
  }
  // Conditional (same shape as markRecordingFailed): only a finalizing
  // recording becomes finalized.
  await prisma.recording.updateMany({
    where: { id: recording.id, status: 'finalizing' },
    data: { status: 'finalized', errorMessage: null },
  });

  // Delete exactly the parts that were assembled. On the recovery re-run
  // (crash after the Upload existed) the assembled set is unknown; capture
  // is long over by then, so every remaining part belongs to this assembly.
  const parts = await prisma.recordingPart.findMany({
    where: assembledPartIds
      ? { id: { in: assembledPartIds } }
      : { segment: { recordingId: recording.id } },
    select: { id: true, storageKey: true },
  });
  if (parts.length > 0) {
    const results = await Promise.allSettled(parts.map(p => deleteObjectByKey(p.storageKey)));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      logger.warn('Some recording part objects could not be deleted after finalize', {
        recordingId: recording.id,
        failed,
        total: parts.length,
      });
    }
    await prisma.recordingPart.deleteMany({ where: { id: { in: parts.map(p => p.id) } } });
  }

  const email = recording.user.email;
  return { enqueueProcessing: !email || !isTestAccount(email) || isAiMocked() };
}

export interface AudioParams {
  codec: string | null;
  channels: number | null;
  sampleRate: number | null;
}

/** Stream-copy concat is only valid when every segment's audio matches. */
export function canStreamCopyConcat(params: AudioParams[]): boolean {
  if (params.length <= 1) return true;
  const [first] = params;
  if (!first.codec || !first.channels || !first.sampleRate) return false;
  return params.every(
    p =>
      p.codec === first.codec &&
      p.channels === first.channels &&
      p.sampleRate === first.sampleRate
  );
}

async function probeAudioParams(filePath: string): Promise<AudioParams> {
  const ffprobeBin = ffprobeBinary();
  try {
    const { stdout } = await execFileAsync(ffprobeBin, [
      '-v', 'quiet',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,channels,sample_rate',
      '-of', 'json',
      filePath,
    ]);
    const stream = JSON.parse(stdout).streams?.[0] ?? {};
    return {
      codec: stream.codec_name ?? null,
      channels: stream.channels != null ? Number(stream.channels) : null,
      sampleRate: stream.sample_rate != null ? Number(stream.sample_rate) : null,
    };
  } catch {
    return { codec: null, channels: null, sampleRate: null };
  }
}

/**
 * ffprobe's container duration, falling back to a full decode (MediaRecorder
 * output can still lack a container duration). Whole seconds, or null.
 */
async function probeDurationWithFallback(filePath: string): Promise<number | null> {
  const probed = await probeAudioDurationSeconds(filePath);
  if (probed != null) return probed;
  try {
    const decoded = await getAudioDuration(filePath);
    return Number.isFinite(decoded) && decoded > 0 ? Math.round(decoded) : null;
  } catch {
    return null;
  }
}
