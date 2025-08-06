import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/services/database';
import { unlink } from 'fs/promises';

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

    // Check if upload is being used by any sessions
    const usage = await db.getUploadUsage(id);
    if (usage.sessionCount > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete upload that is being used by sessions',
          sessions: usage.sessions.map(session => ({
            id: session.id,
            title: session.title,
            campaignId: session.campaignId,
          }))
        },
        { status: 400 }
      );
    }

    // Delete the file from filesystem
    try {
      await unlink(upload.path);
    } catch (fileError) {
      console.warn('Failed to delete file from filesystem:', fileError);
      // Continue with database deletion even if file deletion fails
    }

    // Delete chunk files if they exist
    if (upload.chunkPaths) {
      try {
        const chunkPaths = JSON.parse(upload.chunkPaths);
        for (const chunkPath of chunkPaths) {
          try {
            await unlink(chunkPath);
          } catch (chunkError) {
            console.warn('Failed to delete chunk file:', chunkError);
          }
        }
      } catch (parseError) {
        console.warn('Failed to parse chunk paths:', parseError);
      }
    }

    // Delete upload record from database
    await db.deleteUpload(id);

    console.log(`[Upload] Upload deleted successfully: ${id}`);

    return NextResponse.json({
      message: 'Upload deleted successfully'
    });

  } catch (error) {
    console.error('Delete upload error:', error);
    
    return NextResponse.json(
      { error: 'Failed to delete upload' },
      { status: 500 }
    );
  }
}