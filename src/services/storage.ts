import path from 'path';
import os from 'os';
import fs from 'fs';
import { writeFile, mkdir, unlink, copyFile } from 'fs/promises';
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
 * Upload rows carry `storageKey` (backend-relative key). Legacy rows have
 * only `path` (absolute local filesystem path) and are always local.
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
      // Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env
      // vars via the SDK's default provider chain.
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

/**
 * Persist an uploaded audio buffer. Returns the storage key and, for the
 * local backend, the absolute path written.
 */
export async function saveAudio(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<{ key: string; localPath: string | null }> {
  if (isObjectStorageEnabled()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    logger.info('Audio saved to object storage', { key, bucket: bucket(), size: buffer.length });
    return { key, localPath: null };
  }

  const dest = localPathForKey(key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
  logger.info('Audio saved to local storage', { key, path: dest });
  return { key, localPath: dest };
}

/** Whether the audio object/file for an upload still exists. */
export async function audioExists(upload: Pick<Upload, 'storageKey' | 'path'>): Promise<boolean> {
  if (upload.storageKey && isObjectStorageEnabled()) {
    try {
      await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: upload.storageKey }));
      return true;
    } catch {
      return false;
    }
  }
  const localPath = upload.storageKey ? localPathForKey(upload.storageKey) : upload.path;
  return fs.existsSync(localPath);
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
  upload: Pick<Upload, 'id' | 'storageKey' | 'path' | 'filename'>
): Promise<{ localPath: string; isTemp: boolean } | null> {
  if (upload.storageKey && isObjectStorageEnabled()) {
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

  const localPath = upload.storageKey ? localPathForKey(upload.storageKey) : upload.path;
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
export async function deleteAudio(upload: Pick<Upload, 'storageKey' | 'path'>): Promise<void> {
  if (upload.storageKey && isObjectStorageEnabled()) {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: upload.storageKey }));
    logger.info('Audio deleted from object storage', { key: upload.storageKey });
    return;
  }
  const localPath = upload.storageKey ? localPathForKey(upload.storageKey) : upload.path;
  try {
    await unlink(localPath);
    logger.info('Audio deleted from local storage', { path: localPath });
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
  if (upload.storageKey && isObjectStorageEnabled()) {
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
export function getLocalAudioPath(upload: Pick<Upload, 'storageKey' | 'path'>): string {
  return upload.storageKey && !isObjectStorageEnabled()
    ? localPathForKey(upload.storageKey)
    : upload.path;
}

/**
 * Migrate a legacy local file into the active backend (used opportunistically
 * when old uploads are touched while object storage is enabled).
 */
export async function promoteLocalFile(localPath: string, key: string): Promise<void> {
  if (isObjectStorageEnabled()) {
    const buffer = await fs.promises.readFile(localPath);
    await s3().send(
      new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer })
    );
  } else {
    const dest = localPathForKey(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(localPath, dest);
  }
}
