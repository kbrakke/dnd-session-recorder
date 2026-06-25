import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { Readable } from 'stream';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { getPlaybackUrl, getLocalAudioPath } from '@/services/storage';
import { logger } from '@/lib/logger';

/**
 * GET /api/uploads/[id]/audio - Play the uploaded session audio.
 *
 * Object storage (Tigris): redirects to a short-lived presigned URL — the
 * browser streams directly from the bucket with full HTTP Range support
 * (seeking), and the bytes never proxy through the app.
 *
 * Local storage (dev): streams the file with Range support.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;
    const upload = await db.getUploadById(id);

    if (!upload || upload.userId !== user.id) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    const presigned = await getPlaybackUrl(upload);
    if (presigned) {
      return NextResponse.redirect(presigned, 307);
    }

    const filePath = getLocalAudioPath(upload);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    const { size } = fs.statSync(filePath);
    const baseHeaders = {
      'Content-Type': upload.mimetype,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    };

    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
        if (start <= end && start < size) {
          const stream = fs.createReadStream(filePath, { start, end });
          return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
            status: 206,
            headers: {
              ...baseHeaders,
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Content-Length': String(end - start + 1),
            },
          });
        }
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` },
        });
      }
    }

    const stream = fs.createReadStream(filePath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) },
    });
  } catch (error) {
    logger.error('Failed to serve audio', error as Error);
    return NextResponse.json({ error: 'Failed to serve audio' }, { status: 500 });
  }
}
