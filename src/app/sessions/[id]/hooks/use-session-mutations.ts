'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

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
      const response = await fetch(`/api/summary/${sessionId}`, {
        method: 'POST',
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
      const response = await fetch(`/api/dm-todo/${sessionId}`, {
        method: 'POST',
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

  return {
    startProcessingMutation,
    cancelTranscriptionMutation,
    updateSummaryMutation,
    updateTodoMutation,
    generateSummaryMutation,
    generateTodoMutation,
    deleteSessionMutation,
  };
}
