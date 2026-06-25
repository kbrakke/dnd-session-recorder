import path from 'path';
import os from 'os';
import fs from 'fs';
import { writeFile, mkdir, unlink } from 'fs/promises';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Upload } from '@prisma/client';
import { logger } from '@/lib/logger';

/**
 * Audio storage abstraction.
 *
 * Two backends, selected by environment:
 * - **Object storage (Tigris/S3)** when `BUCKET_NAME` + `AWS_ENDPOINT_URL_S3`
 *   are set (Fly's `fly storage create` sets these automatically). Durable
 *   across machine restarts and shared across machines — required for the
 *   pipeline worker on Fly.
 * - **Local disk** (`UPLOAD_DIR`) otherwise — dev and test default.
 *
 * Every upload row carries a backend-relative `storageKey`; `localPathForKey`
 * resolves it to a path for the local backend.
 */

const uploadDir =
  process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production' ? '/app/data/uploads' : './uploads');

export function isObjectStorageEnabled(): boolean {
  return !!(process.env.BUCKET_NAME && process.env.AWS_ENDPOINT_URL_S3);
}

let s3Singleton: S3Client | null = null;

function s3(): S3Client {
  if (!s3Singleton) {
    s3Singleton = new S3Client({
      region: process.env.AWS_REGION || 'auto',
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      // Tigris uses the default virtual-host style; MinIO (tests) needs
      // path-style.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });
  }
  return s3Singleton;
}

function bucket(): string {
  return process.env.BUCKET_NAME!;
}

function localPathForKey(key: string): string {
  return path.join(uploadDir, key);
}

/** Build the canonical storage key for a new audio upload. */
export function buildAudioKey(userId: string, filename: string): string {
  return `audio/${userId}/${filename}`;
}

/** Persist an uploaded audio buffer to the active backend. */
export async function saveAudio(key: string, buffer: Buffer, contentType: string): Promise<void> {
  if (isObjectStorageEnabled()) {
    await s3().send(
      new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer, ContentType: contentType })
    );
    logger.info('Audio saved to object storage', { key, bucket: bucket(), size: buffer.length });
    return;
  }

  const dest = localPathForKey(key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
  logger.info('Audio saved to local storage', { key, path: dest });
}

/** Whether the audio object/file for an upload still exists. */
export async function audioExists(upload: Pick<Upload, 'storageKey'>): Promise<boolean> {
  if (isObjectStorageEnabled()) {
    try {
      await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: upload.storageKey }));
      return true;
    } catch {
      return false;
    }
  }
  return fs.existsSync(localPathForKey(upload.storageKey));
}

/**
 * Make the upload's audio available as a local file the worker can feed to
 * FFmpeg. Object storage downloads go to a stable temp path so a resumed job
 * on the same machine reuses the file instead of re-downloading.
 *
 * Returns the local path and whether it's a temp copy the caller should
 * delete when done (`cleanupWorkFile`).
 */
export async function ensureLocalAudio(
  upload: Pick<Upload, 'id' | 'storageKey' | 'filename'>
): Promise<{ localPath: string; isTemp: boolean } | null> {
  if (isObjectStorageEnabled()) {
    const workDir = path.join(os.tmpdir(), 'dnd-audio-work');
    await mkdir(workDir, { recursive: true });
    const ext = path.extname(upload.filename);
    const tempPath = path.join(workDir, `${upload.id}${ext}`);

    if (!fs.existsSync(tempPath)) {
      try {
        const response = await s3().send(
          new GetObjectCommand({ Bucket: bucket(), Key: upload.storageKey })
        );
        const bytes = await response.Body!.transformToByteArray();
        await writeFile(tempPath, Buffer.from(bytes));
        logger.info('Audio downloaded from object storage', {
          key: upload.storageKey,
          path: tempPath,
          size: bytes.length,
        });
      } catch (error) {
        logger.error('Failed to download audio from object storage', error as Error, {
          key: upload.storageKey,
        });
        return null;
      }
    }
    return { localPath: tempPath, isTemp: true };
  }

  const localPath = localPathForKey(upload.storageKey);
  if (!fs.existsSync(localPath)) {
    return null;
  }
  return { localPath, isTemp: false };
}

/** Delete a temp working copy created by ensureLocalAudio (no-op for originals). */
export async function cleanupWorkFile(localPath: string, isTemp: boolean): Promise<void> {
  if (!isTemp) return;
  try {
    await unlink(localPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Failed to remove temp audio file', { path: localPath });
    }
  }
}

/** Permanently delete an upload's audio from whichever backend holds it. */
export async function deleteAudio(upload: Pick<Upload, 'storageKey'>): Promise<void> {
  if (isObjectStorageEnabled()) {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: upload.storageKey }));
    logger.info('Audio deleted from object storage', { key: upload.storageKey });
    return;
  }
  try {
    await unlink(localPathForKey(upload.storageKey));
    logger.info('Audio deleted from local storage', { key: upload.storageKey });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Playback URL for the browser. Object storage returns a presigned GET URL
 * (Tigris serves it directly, with HTTP Range support for seeking); local
 * storage returns null and the playback route streams the file itself.
 */
export async function getPlaybackUrl(
  upload: Pick<Upload, 'storageKey' | 'mimetype'>,
  expiresInSeconds = 3600
): Promise<string | null> {
  if (isObjectStorageEnabled()) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: bucket(),
        Key: upload.storageKey,
        ResponseContentType: upload.mimetype,
      }),
      { expiresIn: expiresInSeconds }
    );
  }
  return null;
}

/** Resolve the local file path for a local-backend upload (playback streaming). */
export function getLocalAudioPath(upload: Pick<Upload, 'storageKey'>): string {
  return localPathForKey(upload.storageKey);
}
