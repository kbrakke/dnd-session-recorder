'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createRecorderApi } from '@/lib/recording/api';

const recorderApi = createRecorderApi();

interface UseSessionMutationsProps {
  sessionId: string;
}

/**
 * Custom hook for managing all session-related mutations.
 *
 * Consolidates mutations for processing, deleting, and updating session data.
 *
 * @param sessionId - The session ID for mutations
 * @returns Mutation functions and states
 */
export function useSessionMutations({ sessionId }: UseSessionMutationsProps) {
  const queryClient = useQueryClient();

  const startProcessingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}/process`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Failed to start processing');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['transcriptions', sessionId] });
    },
  });

  const cancelTranscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/transcription/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel transcription');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['transcriptions', sessionId] });
    },
  });

  const updateSummaryMutation = useMutation({
    mutationFn: async (summaryText: string) => {
      const response = await fetch(`/api/summary/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary_text: summaryText }),
      });
      if (!response.ok) throw new Error('Failed to update summary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/dm-todo/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('Failed to update TODO');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dmTodoList', sessionId] });
    },
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      // force: regenerate even when a summary already exists
      const response = await fetch(`/api/summary/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (!response.ok) throw new Error('Failed to generate summary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });
    },
  });

  const generateTodoMutation = useMutation({
    mutationFn: async () => {
      // force: regenerate even when a TODO list already exists
      const response = await fetch(`/api/dm-todo/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (!response.ok) throw new Error('Failed to generate TODO');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dmTodoList', sessionId] });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionToDelete: { id: string; title: string; campaignId: string }) => {
      const response = await fetch(`/api/sessions/${sessionToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete session');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // If we're deleting the current session, redirect to campaign page
      if (variables.id === sessionId) {
        window.location.href = `/campaigns/${data.campaignId}`;
      } else {
        // Otherwise just invalidate the campaign sessions list
        queryClient.invalidateQueries({ queryKey: ['campaign-sessions'] });
      }
    },
  });

  // Recovery card actions for an interrupted/failed live recording. `force`
  // is only sent after the user confirmed a still-capturing warning (the
  // mutation error carries kind 'still-capturing' + lastHeartbeatAt).
  const finalizeRecordingMutation = useMutation({
    mutationFn: ({ recordingId, force }: { recordingId: string; force?: boolean }) =>
      recorderApi.finalizeRecording(recordingId, { force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['progress', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  // Discarding keeps the (draft) session — unlike deleteSessionMutation.
  const discardRecordingMutation = useMutation({
    mutationFn: ({ recordingId, force }: { recordingId: string; force?: boolean }) =>
      recorderApi.discardRecording(recordingId, { force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  return {
    finalizeRecordingMutation,
    discardRecordingMutation,
    startProcessingMutation,
    cancelTranscriptionMutation,
    updateSummaryMutation,
    updateTodoMutation,
    generateSummaryMutation,
    generateTodoMutation,
    deleteSessionMutation,
  };
}
