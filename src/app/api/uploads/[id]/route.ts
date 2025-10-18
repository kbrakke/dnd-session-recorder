import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

// GET /api/uploads/[id] - Get specific upload
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const upload = await db.getUploadById(id);
    
    if (!upload) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }

    // Check if user owns this upload
    if (upload.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Get usage information
    const usage = await db.getUploadUsage(id);

    return NextResponse.json({
      upload: {
        id: upload.id,
        filename: upload.filename,
        originalName: upload.originalName,
        size: upload.size,
        mimetype: upload.mimetype,
        duration: upload.duration,
        status: upload.status,
        createdAt: upload.createdAt,
        updatedAt: upload.updatedAt,
        usage: {
          sessionCount: usage.sessionCount,
          sessions: usage.sessions.map(session => ({
            id: session.id,
            title: session.title,
            campaignId: session.campaignId,
            status: session.status,
          }))
        }
      }
    });

  } catch (error) {
    console.error('Get upload error:', error);
    
    return NextResponse.json(
      { error: 'Failed to get upload' },
      { status: 500 }
    );
  }
}

// DELETE /api/uploads/[id] - Delete upload
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const { error: authError, user } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Invalid upload ID' },
        { status: 400 }
      );
    }

    // Get upload details
    const upload = await db.getUploadById(id);

    if (!upload) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }

    // Check if user owns this upload
    if (upload.userId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden - You do not own this upload' },
        { status: 403 }
      );
    }

    // Check if upload is being used by any sessions
    const usage = await db.getUploadUsage(id);
    if (usage.sessionCount > 0) {
      console.log(`[Upload Delete] Cannot delete upload ${id}: Used by ${usage.sessionCount} session(s)`);
      return NextResponse.json(
        {
          error: 'Cannot delete upload that is being used by sessions',
          message: `This upload is used by ${usage.sessionCount} session(s). Please remove it from all sessions first.`,
          sessionCount: usage.sessionCount,
          sessions: usage.sessions.map(session => ({
            id: session.id,
            title: session.title,
            campaignId: session.campaignId,
            status: session.status,
          }))
        },
        { status: 400 }
      );
    }

    console.log(`[Upload Delete] Starting deletion for upload ${id}: ${upload.originalName}`);

    // Delete the main file from filesystem
    let filesDeleted = 0;
    let filesFailedToDelete = 0;

    if (existsSync(upload.path)) {
      try {
        await unlink(upload.path);
        filesDeleted++;
        console.log(`[Upload Delete] Deleted main file: ${upload.path}`);
      } catch (fileError) {
        filesFailedToDelete++;
        console.error(`[Upload Delete] Failed to delete main file: ${upload.path}`, fileError);
      }
    } else {
      console.warn(`[Upload Delete] Main file not found: ${upload.path}`);
    }

    // Delete chunk files if they exist
    if (upload.chunkPaths) {
      try {
        const chunkPaths = JSON.parse(upload.chunkPaths);
        console.log(`[Upload Delete] Found ${chunkPaths.length} chunk files to delete`);

        for (const chunkPath of chunkPaths) {
          if (existsSync(chunkPath)) {
            try {
              await unlink(chunkPath);
              filesDeleted++;
            } catch (chunkError) {
              filesFailedToDelete++;
              console.error(`[Upload Delete] Failed to delete chunk: ${chunkPath}`, chunkError);
            }
          }
        }
      } catch (parseError) {
        console.error('[Upload Delete] Failed to parse chunk paths:', parseError);
      }
    }

    // Delete upload record from database
    await db.deleteUpload(id);

    console.log(`[Upload Delete] Upload ${id} deleted successfully. Files deleted: ${filesDeleted}, Failed: ${filesFailedToDelete}`);

    return NextResponse.json({
      message: 'Upload deleted successfully',
      details: {
        uploadId: id,
        filesDeleted,
        filesFailedToDelete,
      }
    });

  } catch (error) {
    console.error('[Upload Delete] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to delete upload',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}