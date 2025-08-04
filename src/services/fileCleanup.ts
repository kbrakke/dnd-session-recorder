import { unlink, access } from 'fs/promises';
import { constants } from 'fs';
import { db } from './database';

export class FileCleanupService {
  /**
   * Clean up files for a specific upload after transcription is complete
   */
  async cleanupUploadFiles(uploadId: string): Promise<void> {
    try {
      const upload = await db.getUploadById(uploadId);
      if (!upload) {
        throw new Error('Upload not found');
      }

      // Check if upload is in a state where files can be cleaned up
      if (upload.status !== 'transcribed') {
        console.warn(`[FileCleanup] Upload ${uploadId} is not in transcribed state (${upload.status}), skipping cleanup`);
        return;
      }

      // Delete the main audio file
      await this.deleteFileIfExists(upload.path);

      // Delete chunk files if they exist
      if (upload.chunkPaths) {
        try {
          const chunkPaths = JSON.parse(upload.chunkPaths);
          for (const chunkPath of chunkPaths) {
            await this.deleteFileIfExists(chunkPath);
          }
        } catch (parseError) {
          console.warn(`[FileCleanup] Failed to parse chunk paths for upload ${uploadId}:`, parseError);
        }
      }

      // Update upload status to indicate files have been cleaned
      await db.updateUploadStatus(uploadId, 'cleaned', []);

      console.log(`[FileCleanup] Successfully cleaned up files for upload ${uploadId}`);

    } catch (error) {
      console.error(`[FileCleanup] Error cleaning up files for upload ${uploadId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up files for a specific session after transcription is complete
   */
  async cleanupSessionFiles(sessionId: string): Promise<void> {
    try {
      const session = await db.getSessionById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // If session has an upload, clean up the upload files
      if (session.uploadId) {
        await this.cleanupUploadFiles(session.uploadId);
      }

      // If session has a direct audio file path (backwards compatibility), clean it up
      if (session.audioFilePath && session.audioFilePath !== session.upload?.path) {
        await this.deleteFileIfExists(session.audioFilePath);
      }

      console.log(`[FileCleanup] Successfully cleaned up files for session ${sessionId}`);

    } catch (error) {
      console.error(`[FileCleanup] Error cleaning up files for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Batch cleanup for multiple uploads
   */
  async batchCleanupUploads(uploadIds: string[]): Promise<void> {
    const results = await Promise.allSettled(
      uploadIds.map(uploadId => this.cleanupUploadFiles(uploadId))
    );

    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result, index) => `Upload ${uploadIds[index]}: ${result.reason}`);

    if (errors.length > 0) {
      console.error(`[FileCleanup] Batch cleanup had ${errors.length} errors:`, errors);
    }

    const successful = results.filter(result => result.status === 'fulfilled').length;
    console.log(`[FileCleanup] Batch cleanup completed: ${successful}/${uploadIds.length} successful`);
  }

  /**
   * Clean up old uploads that are eligible for cleanup
   */
  async cleanupOldUploads(olderThanDays: number = 7): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // This would require a new database method to find old transcribed uploads
      // For now, we'll skip this implementation as it requires additional database queries
      console.log(`[FileCleanup] Automated cleanup for uploads older than ${olderThanDays} days is not yet implemented`);

    } catch (error) {
      console.error('[FileCleanup] Error during automated cleanup:', error);
      throw error;
    }
  }

  /**
   * Delete a file if it exists
   */
  private async deleteFileIfExists(filePath: string): Promise<void> {
    try {
      // Check if file exists
      await access(filePath, constants.F_OK);
      
      // Delete the file
      await unlink(filePath);
      
      console.log(`[FileCleanup] Deleted file: ${filePath}`);
    } catch (error: unknown) {
      if (error instanceof Error && (error as any).code === 'ENOENT') {
        // File doesn't exist, which is fine
        console.log(`[FileCleanup] File already deleted or doesn't exist: ${filePath}`);
      } else {
        console.error(`[FileCleanup] Error deleting file ${filePath}:`, error);
        throw error;
      }
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    totalUploads: number;
    transcribedUploads: number;
    cleanedUploads: number;
    pendingCleanup: number;
  }> {
    // This would require additional database queries to get these stats
    // For now, returning placeholder values
    return {
      totalUploads: 0,
      transcribedUploads: 0,
      cleanedUploads: 0,
      pendingCleanup: 0,
    };
  }
}

// Create singleton instance
export const fileCleanup = new FileCleanupService();
export default fileCleanup;