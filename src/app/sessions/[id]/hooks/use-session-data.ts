'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isInFlight } from '@/lib/session-status';
import type {
  SessionDetail,
  SessionProgress,
  Summary,
  DmTodoList,
  Transcription,
  GamingSession,
} from '../types';

interface UseSessionDataProps {
  sessionId: string;
}

/**
 * Custom hook for managing all session-related data fetching.
 *
 * While the pipeline is working, the only thing polled is the lightweight
 * /progress endpoint (no transcript payload). The heavy queries (session with
 * full transcript, summary, todos, transcriptions) refetch only when progress
 * reports an actual transition — not on a timer.
 *
 * @param sessionId - The session ID to fetch data for
 * @returns Consolidated session data with loading states
 */
export function useSessionData({ sessionId }: UseSessionDataProps) {
  const queryClient = useQueryClient();

  // Main session query — no interval; refreshed via progress-driven invalidation
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
    refetchOnMount: true,
    staleTime: 0,
  });

  // Lightweight progress poll, only while the pipeline is queued or running
  const { data: progress } = useQuery<SessionProgress>({
    queryKey: ['progress', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}/progress`);
      if (!response.ok) throw new Error('Failed to fetch progress');
      return response.json();
    },
    enabled: !!session && isInFlight(session.status),
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? session?.status;
      if (!status || !isInFlight(status)) return false;
      // 'uploaded' means no job is running yet — check lazily for the
      // auto-trigger landing; actively working states poll faster.
      return status === 'uploaded' ? 5000 : 2500;
    },
    staleTime: 0,
  });

  // When progress reports a transition (status, step, or chunk count), refresh
  // the heavy queries once instead of polling them on a timer.
  const lastTransition = useRef<string | null>(null);
  useEffect(() => {
    if (!progress) return;
    const fingerprint = `${progress.status}|${progress.currentStep}|${progress.chunksCompleted}`;
    if (lastTransition.current !== null && lastTransition.current !== fingerprint) {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['transcriptions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['dmTodoList', sessionId] });
    }
    lastTransition.current = fingerprint;
  }, [progress, queryClient, sessionId]);

  // Campaign sessions query (sidebar) — no interval needed
  const { data: campaignSessions = [] } = useQuery<GamingSession[]>({
    queryKey: ['campaign-sessions', session?.campaign.id],
    queryFn: async () => {
      const response = await fetch(`/api/sessions?campaignId=${session!.campaign.id}`);
      if (!response.ok) throw new Error('Failed to fetch campaign sessions');
      return response.json();
    },
    enabled: !!session?.campaign.id,
  });

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
  });

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
  });

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
  });

  // Overlay the freshest progress fields onto the (possibly stale) session so
  // status/chunk-count UI moves with the lightweight poll.
  const mergedSession: SessionDetail | null = session
    ? progress
      ? {
          ...session,
          status: progress.status,
          transcriptionProgress: progress.transcriptionProgress,
          totalChunks: progress.totalChunks,
          chunksCompleted: progress.chunksCompleted,
          currentStep: progress.currentStep,
          errorStep: progress.errorStep,
          errorMessage: progress.errorMessage,
        }
      : session
    : null;

  return {
    session: mergedSession,
    campaign: session?.campaign || null,
    campaignSessions,
    summary: summary || null,
    dmTodoList: dmTodoList || null,
    transcriptions,
    progress: progress || null,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  };
}
