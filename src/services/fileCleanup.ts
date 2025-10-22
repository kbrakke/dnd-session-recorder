import { unlink, access } from 'fs/promises';
import { constants } from 'fs';
import { db } from './database';
import { logger } from '@/lib/logger';

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
        logger.warn('Upload not in transcribed state, skipping cleanup', {
          uploadId,
          status: upload.status
        });
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
          logger.warn('Failed to parse chunk paths for upload', { uploadId, error: parseError });
        }
      }

      // Update upload status to indicate files have been cleaned
      await db.updateUploadStatus(uploadId, 'cleaned', []);

      logger.info('Successfully cleaned up files for upload', { uploadId });

    } catch (error) {
      logger.error('Error cleaning up files for upload', error as Error, { uploadId });
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

      // Audio file cleanup is now handled through the Upload relationship only
      // No need for legacy audioFilePath handling

      logger.info('Successfully cleaned up files for session', { sessionId });

    } catch (error) {
      logger.error('Error cleaning up files for session', error as Error, { sessionId });
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
      logger.error('Batch cleanup had errors', undefined, { errorCount: errors.length, errors });
    }

    const successful = results.filter(result => result.status === 'fulfilled').length;
    logger.info('Batch cleanup completed', { successful, total: uploadIds.length });
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
      logger.info('Automated cleanup not yet implemented', { olderThanDays });

    } catch (error) {
      logger.error('Error during automated cleanup', error as Error);
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

      logger.debug('Deleted file', { filePath });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // File doesn't exist, which is fine
        logger.debug('File already deleted or does not exist', { filePath });
      } else {
        logger.error('Error deleting file', error as Error, { filePath });
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