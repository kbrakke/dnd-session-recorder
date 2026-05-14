'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Upload } from '../types';
import { logger } from '@/lib/logger';

interface UseUploadStateProps {
  sessionId: string;
}

/**
 * Custom hook for managing file upload state and operations.
 *
 * Handles both new file uploads and linking existing uploads to sessions.
 *
 * @param sessionId - The session ID to upload files to
 * @returns Upload state and mutation functions
 */
export function useUploadState({ sessionId }: UseUploadStateProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showExistingUploads, setShowExistingUploads] = useState(false);
  const queryClient = useQueryClient();

  // Fetch existing uploads (only when needed)
  const { data: uploads = [] } = useQuery<Upload[]>({
    queryKey: ['uploads'],
    queryFn: async () => {
      const response = await fetch('/api/uploads');
      if (!response.ok) throw new Error('Failed to fetch uploads');
      const data = await response.json();
      return data.uploads || [];
    },
    enabled: showExistingUploads,
  });

  // Upload new file mutation
  const uploadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      // Upload file to storage
      const uploadFormData = new FormData();
      uploadFormData.append('audio', file);

      const uploadResponse = await fetch('/api/uploads', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || 'Failed to upload file');
      }

      const uploadData = await uploadResponse.json();

      // Link upload to session
      const linkResponse = await fetch(`/api/sessions/${sessionId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: uploadData.upload.id,
          duration: uploadData.upload.duration,
        }),
      });

      if (!linkResponse.ok) {
        const error = await linkResponse.json();
        throw new Error(error.error || 'Failed to link upload to session');
      }

      // Trigger processing
      const processResponse = await fetch(`/api/sessions/${sessionId}/process`, {
        method: 'POST',
      });

      if (!processResponse.ok) {
        logger.warn('Failed to trigger transcription, but upload was successful', {
          sessionId,
        });
      }

      return linkResponse.json();
    },
    onSuccess: () => {
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['transcriptions', sessionId] });
    },
  });

  // Link existing upload mutation
  const linkExistingUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const upload = uploads.find((u) => u.id === uploadId);

      const linkResponse = await fetch(`/api/sessions/${sessionId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: uploadId,
          duration: upload?.duration,
        }),
      });

      if (!linkResponse.ok) {
        const error = await linkResponse.json();
        throw new Error(
          error.details || error.error || 'Failed to link upload to session'
        );
      }

      // Trigger processing
      const processResponse = await fetch(`/api/sessions/${sessionId}/process`, {
        method: 'POST',
      });

      if (!processResponse.ok) {
        logger.warn('Failed to trigger transcription, but upload was linked successfully', {
          sessionId,
        });
      }

      return linkResponse.json();
    },
    onSuccess: () => {
      setShowExistingUploads(false);
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['transcriptions', sessionId] });
    },
  });

  return {
    selectedFile,
    setSelectedFile,
    showExistingUploads,
    setShowExistingUploads,
    uploads,
    uploadFile: uploadAudioMutation.mutate,
    isUploading: uploadAudioMutation.isPending,
    uploadError: uploadAudioMutation.error,
    linkExistingUpload: linkExistingUploadMutation.mutate,
    isLinking: linkExistingUploadMutation.isPending,
    linkingUploadId: linkExistingUploadMutation.variables || null,
  };
}
