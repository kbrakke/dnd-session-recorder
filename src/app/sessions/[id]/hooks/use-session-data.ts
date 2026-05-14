'use client';

import { useQuery } from '@tanstack/react-query';
import type { SessionDetail, Summary, DmTodoList, Transcription, GamingSession } from '../types';

interface UseSessionDataProps {
  sessionId: string;
}

/**
 * Custom hook for managing all session-related data fetching.
 *
 * Consolidates multiple queries for session, campaign, summary, todos, and transcriptions.
 * Automatically polls during processing states.
 *
 * @param sessionId - The session ID to fetch data for
 * @returns Consolidated session data with loading states
 */
export function useSessionData({ sessionId }: UseSessionDataProps) {
  // Main session query with automatic polling during processing
  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useQuery<SessionDetail>({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      return response.json();
    },
    refetchInterval: (query) => {
      const session = query.state.data;
      if (!session) return false;

      // Poll during processing
      if (session.status === 'transcribing' || session.status === 'summarizing') {
        return 2000; // Every 2 seconds
      }
      if (session.status === 'uploaded') return 1000;
      if (session.status === 'error') return 5000;
      return false; // Don't poll when completed
    },
    refetchOnMount: true,
    staleTime: 0,
  });

  // Campaign sessions query
  const { data: campaignSessions = [] } = useQuery<GamingSession[]>({
    queryKey: ['campaign-sessions', session?.campaign.id],
    queryFn: async () => {
      const response = await fetch(`/api/sessions?campaignId=${session!.campaign.id}`);
      if (!response.ok) throw new Error('Failed to fetch campaign sessions');
      return response.json();
    },
    enabled: !!session?.campaign.id,
    refetchInterval: 10000,
  });

  // Summary query with polling during summarization
  const { data: summary } = useQuery<Summary | null>({
    queryKey: ['summary', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/summary/${sessionId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch summary');
      }
      return response.json();
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      if (session?.status === 'summarizing') return 2000;
      if (session?.status === 'transcribed' && !query.state.data) return 3000;
      return false;
    },
  });

  // DM TODO query with polling during summarization
  const { data: dmTodoList } = useQuery<DmTodoList | null>({
    queryKey: ['dmTodoList', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/dm-todo/${sessionId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch TODO list');
      }
      return response.json();
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      if (session?.status === 'summarizing') return 2000;
      if (summary && !query.state.data) return 3000;
      return false;
    },
  });

  // Transcriptions query with polling during transcription
  const { data: transcriptions = [] } = useQuery<Transcription[]>({
    queryKey: ['transcriptions', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}/transcriptions`);
      if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error('Failed to fetch transcriptions');
      }
      return response.json();
    },
    enabled: !!sessionId,
    refetchInterval: () => {
      if (session?.status === 'transcribing') return 2000;
      return false;
    },
  });

  return {
    session: session || null,
    campaign: session?.campaign || null,
    campaignSessions,
    summary: summary || null,
    dmTodoList: dmTodoList || null,
    transcriptions,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  };
}
