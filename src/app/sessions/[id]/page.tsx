'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useRef, Suspense } from 'react';
import { isNil } from 'lodash';
import {
  Calendar,
  Clock,
  BookOpen,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Edit3,
  RefreshCw,
  CheckCircle,
  Save,
  Upload,
  AlertCircle,
  XCircle,
  Play,
  Loader2,
  Trash2,
} from 'lucide-react';
import { marked } from 'marked';
import { logger } from '@/lib/logger';

// Interfaces
interface Session {
  id: string;
  title: string;
  sessionDate: string;
  duration: number | null;
  status: string;
  campaign: {
    id: string;
    name: string;
  };
}

interface SessionDetail extends Session {
  uploadId: string | null;
  createdAt: string;
  currentStep: string | null;
  totalChunks: number | null;
  chunksCompleted: number | null;
  transcriptionProgress: number | null;
  errorStep: string | null;
  errorMessage: string | null;
  lastError: string | null;
  processingStartedAt: string | null;
  lastProgressAt: string | null;
  _count: {
    transcriptions: number;
  };
}

interface Summary {
  id: number;
  summaryText: string;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
}

interface DmTodoList {
  id: number;
  content: string;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
}

interface Transcription {
  id: number;
  text: string;
  startTime: number;
  endTime: number;
}

interface Upload {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  duration: number | null;
  createdAt: string;
}

// Pipeline Step Component
function PipelineStep({
  label,
  status,
  isActive,
  isLast,
  onStart,
  onCancel,
  progressPercent,
  minutesElapsed,
  isTimedOut,
  subStatus,
}: {
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  isActive: boolean;
  isLast?: boolean;
  onStart?: () => void;
  onCancel?: () => void;
  progressPercent?: number;
  minutesElapsed?: number;
  isTimedOut?: boolean;
  subStatus?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center min-w-[100px]">
        <div
          className={`relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${status === 'complete'
              ? 'bg-green-500 border-green-500'
              : status === 'active'
                ? 'bg-blue-500 border-blue-500'
                : status === 'error'
                  ? 'bg-red-500 border-red-500'
                  : 'bg-gray-200 border-gray-300'
            }`}
        >
          {status === 'complete' && (
            <CheckCircle className="w-6 h-6 text-white" />
          )}
          {status === 'active' && (
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          )}
          {status === 'error' && <XCircle className="w-6 h-6 text-white" />}
          {status === 'pending' && onStart && (
            <button
              onClick={onStart}
              className="w-full h-full flex items-center justify-center hover:bg-blue-100 rounded-full transition-colors"
              title={`Start ${label}`}
            >
              <Play className="w-5 h-5 text-gray-600" />
            </button>
          )}
        </div>
        <div className="mt-1 text-xs font-medium text-gray-700">{label}</div>
        {isActive && subStatus && (
          <div className="mt-1 text-xs text-blue-600 text-center max-w-[120px]">
            {subStatus}
          </div>
        )}
        {isActive && progressPercent !== undefined && progressPercent > 0 && (
          <div className="mt-1 text-xs text-gray-500">{progressPercent}%</div>
        )}
        {isActive && isTimedOut && (
          <div className="mt-1 text-xs text-orange-600 font-semibold">
            ⚠️ {minutesElapsed}m
          </div>
        )}
        {isActive && onCancel && (
          <button
            onClick={onCancel}
            className="mt-1 text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Cancel
          </button>
        )}
      </div>
      {!isLast && (
        <div
          className={`h-0.5 w-16 ${status === 'complete' ? 'bg-green-500' : 'bg-gray-300'
            }`}
        />
      )}
    </div>
  );
}

function SessionPageRedesignInner() {
  const params = useParams();
  const sessionId = params.id as string;
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Track if we just created this session with processing
  const initialState = searchParams.get('initialState');
  const isInitialProcessing = initialState === 'processing';
  const hasReceivedFirstData = useRef(false);

  // State
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummaryText, setEditedSummaryText] = useState('');
  const [isEditingTodo, setIsEditingTodo] = useState(false);
  const [editedTodoText, setEditedTodoText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [showExistingUploads, setShowExistingUploads] = useState(false);
  const [linkingUploadId, setLinkingUploadId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string; campaignId: string } | null>(null);

  // Data fetching
  const { data: session, isLoading: sessionLoading } = useQuery<SessionDetail>({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      const data = await response.json();
      hasReceivedFirstData.current = true;
      return data;
    },
    refetchInterval: (query) => {
      const session = query.state.data;
      // Poll more frequently when processing
      if (session?.status === 'transcribing' || session?.status === 'summarizing') {
        return 2000; // 2 seconds when actively processing
      }
      if (session?.status === 'uploaded' || session?.status === 'error') {
        return 5000; // 5 seconds when waiting or errored
      }
      return false; // Don't poll when completed
    },
    // Start fetching immediately if we're expecting processing
    refetchOnMount: true,
    staleTime: 0, // Always consider stale so we fetch fresh data
  });

  const { data: campaignSessions = [] } = useQuery<Session[]>({
    queryKey: ['campaign-sessions', session?.campaign.id],
    queryFn: async () => {
      const response = await fetch(
        `/api/sessions?campaignId=${session!.campaign.id}`
      );
      if (!response.ok) throw new Error('Failed to fetch campaign sessions');
      return response.json();
    },
    enabled: !!session?.campaign.id,
    refetchInterval: 10000, // Refresh every 10 seconds to catch new sessions
  });

  const { data: summary } = useQuery<Summary>({
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
      // Poll when summarizing or when transcribed but no summary yet
      if (session?.status === 'summarizing') return 2000;
      if (session?.status === 'transcribed' && !query.state.data) return 3000;
      return false;
    },
  });

  const { data: dmTodoList } = useQuery<DmTodoList>({
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
      // Poll when summarizing or when we have summary but no todo yet
      if (session?.status === 'summarizing') return 2000;
      if (summary && !query.state.data) return 3000;
      return false;
    },
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
    refetchInterval: () => {
      // Poll when transcribing
      if (session?.status === 'transcribing') return 2000;
      return false;
    },
  });

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

  // Mutations
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
      setIsEditingSummary(false);
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
      setIsEditingTodo(false);
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

  const uploadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploadingAudio(true);
      setUploadError(null);

      // First, upload the file
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

      // Then link it to the session
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

      // Trigger transcription
      const processResponse = await fetch(
        `/api/sessions/${sessionId}/process`,
        {
          method: 'POST',
        }
      );

      if (!processResponse.ok) {
        logger.warn('Failed to trigger transcription, but upload was successful', { sessionId });
      }

      return linkResponse.json();
    },
    onSuccess: () => {
      setIsUploadingAudio(false);
      setSelectedFile(null);
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({
        queryKey: ['transcriptions', sessionId],
      });
    },
    onError: (error: Error) => {
      setIsUploadingAudio(false);
      setUploadError(error.message);
    },
  });

  const linkExistingUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      setLinkingUploadId(uploadId);
      setUploadError(null);

      const upload = uploads.find((u) => u.id === uploadId);

      // Link upload to session
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

      // Trigger transcription
      const processResponse = await fetch(
        `/api/sessions/${sessionId}/process`,
        {
          method: 'POST',
        }
      );

      if (!processResponse.ok) {
        logger.warn('Failed to trigger transcription, but upload was linked successfully', { sessionId });
      }

      return linkResponse.json();
    },
    onSuccess: () => {
      setLinkingUploadId(null);
      setShowExistingUploads(false);
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({
        queryKey: ['transcriptions', sessionId],
      });
    },
    onError: (error: Error) => {
      setLinkingUploadId(null);
      setUploadError(error.message);
    },
  });

  const _retryTranscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}/process`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.details || error.error || 'Failed to retry transcription'
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({
        queryKey: ['transcriptions', sessionId],
      });
    },
  });

  const cancelTranscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/transcription/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || 'Failed to cancel transcription'
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({
        queryKey: ['transcriptions', sessionId],
      });
    },
  });

  const startProcessingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}/process`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.details || error.error || 'Failed to start processing'
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({
        queryKey: ['transcriptions', sessionId],
      });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionToDelete) throw new Error('No session selected for deletion');

      const response = await fetch(`/api/sessions/${sessionToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete session');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // If deleting the current session, redirect to campaign page
      if (sessionToDelete?.id === sessionId) {
        window.location.href = `/campaigns/${data.campaignId}`;
      } else {
        // If deleting another session, just refresh the campaign sessions list
        queryClient.invalidateQueries({ queryKey: ['campaign-sessions', session?.campaign.id] });
        setSessionToDelete(null);
        setShowDeleteModal(false);
      }
    },
  });

  // Handlers
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleEditSummary = () => {
    if (summary) {
      setEditedSummaryText(summary.summaryText);
      setIsEditingSummary(true);
    }
  };

  const handleSaveSummary = () => {
    updateSummaryMutation.mutate(editedSummaryText);
  };

  const handleEditTodo = () => {
    if (dmTodoList) {
      setEditedTodoText(dmTodoList.content);
      setIsEditingTodo(true);
    }
  };

  const handleSaveTodo = () => {
    updateTodoMutation.mutate(editedTodoText);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'Unknown';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      uploaded: 'bg-blue-100 text-blue-800',
      transcribing: 'bg-yellow-100 text-yellow-800',
      transcribed: 'bg-green-100 text-green-800',
      summarizing: 'bg-purple-100 text-purple-800',
      completed: 'bg-emerald-100 text-emerald-800',
      error: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Show optimistic loading state when we know processing should be happening
  // but haven't received data yet
  const showOptimisticProcessing = isInitialProcessing && !hasReceivedFirstData.current;

  if (sessionLoading || !session) {
    // If we're in initial processing mode, show a processing skeleton instead of just spinner
    if (showOptimisticProcessing) {
      return (
        <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
          {/* Pipeline Progress Header - Optimistic State */}
          <div className="border-b border-gray-200 bg-white">
            <div className="px-6 py-4">
              <div className="flex items-center justify-center gap-0">
                <PipelineStep label="Upload" status="complete" isActive={false} />
                <PipelineStep label="Transcribe" status="active" isActive={true} subStatus="Preparing..." />
                <PipelineStep label="Summarize" status="pending" isActive={false} />
                <PipelineStep label="Complete" status="pending" isActive={false} isLast={true} />
              </div>
            </div>
          </div>
          {/* Loading skeleton */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/4"></div>
              <div className="h-32 bg-gray-200 rounded animate-pulse mt-8"></div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const needsAudio = !session?.uploadId && transcriptions.length === 0;
  const hasError = session?.status === 'error';
  const _isProcessing =
    session?.uploadId &&
    !hasError &&
    (session.status === 'uploaded' ||
      session.status === 'transcribing' ||
      session.status === 'transcribed' ||
      session.status === 'summarizing');
  const isComplete = transcriptions.length > 0 && summary && dmTodoList;

  // Check if processing has timed out (started more than 30 minutes ago)
  const processingTimedOut = session?.processingStartedAt
    ? (new Date().getTime() - new Date(session.processingStartedAt).getTime()) / (1000 * 60) > 30
    : false;

  const processingMinutesElapsed = session?.processingStartedAt
    ? Math.floor((new Date().getTime() - new Date(session.processingStartedAt).getTime()) / (1000 * 60))
    : 0;

  // Pipeline step status calculation
  const hasUpload = !!session?.uploadId;
  const hasTranscription = transcriptions.length > 0;
  const hasSummary = !!summary;
  const _hasTodoList = !!dmTodoList;

  const getStepStatus = (step: 'upload' | 'transcribe' | 'summarize' | 'complete'): 'pending' | 'active' | 'complete' | 'error' => {
    if (hasError && (
      (step === 'transcribe' && session.errorStep?.includes('transcri')) ||
      (step === 'summarize' && session.errorStep?.includes('summar'))
    )) {
      return 'error';
    }

    switch (step) {
      case 'upload':
        return hasUpload ? 'complete' : 'pending';
      case 'transcribe':
        if (hasTranscription) return 'complete';
        if (session.status === 'transcribing') return 'active';
        return hasUpload ? 'pending' : 'pending';
      case 'summarize':
        if (hasSummary) return 'complete';
        if (session.status === 'summarizing') return 'active';
        return hasTranscription ? 'pending' : 'pending';
      case 'complete':
        if (isComplete) return 'complete';
        return hasSummary ? 'pending' : 'pending';
    }
  };

  // Get detailed transcription sub-status
  const getTranscriptionSubStatus = (): string | undefined => {
    if (session.status !== 'transcribing') return undefined;

    const step = session.currentStep;
    const chunks = session.totalChunks;
    const completed = session.chunksCompleted;

    if (step === 'chunking') {
      return chunks ? `Creating ${chunks} chunks` : 'Checking audio...';
    }
    if (step === 'transcribing' && chunks && !isNil(completed)) {
      return `Chunk ${completed + 1}/${chunks}`;
    }
    if (step === 'stitching') {
      return 'Stitching...';
    }
    // Default state when transcribing but no specific step yet
    return 'Preparing...';
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Pipeline Progress Header */}
      {!isComplete && (
        <div className="border-b border-gray-200 bg-white">
          <div className="px-6 py-4">
            <div className="flex items-center justify-center gap-0">
              <PipelineStep
                label="Upload"
                status={getStepStatus('upload')}
                isActive={!hasUpload}
                onStart={needsAudio ? undefined : () => { }}
              />
              <PipelineStep
                label="Transcribe"
                status={getStepStatus('transcribe')}
                isActive={session.status === 'transcribing'}
                onStart={hasUpload && !hasTranscription && session.status !== 'transcribing' ? () => startProcessingMutation.mutate() : undefined}
                onCancel={session.status === 'transcribing' ? () => cancelTranscriptionMutation.mutate() : undefined}
                progressPercent={session.transcriptionProgress || undefined}
                minutesElapsed={session.status === 'transcribing' ? processingMinutesElapsed : undefined}
                isTimedOut={session.status === 'transcribing' && processingTimedOut}
                subStatus={getTranscriptionSubStatus()}
              />
              <PipelineStep
                label="Summarize"
                status={getStepStatus('summarize')}
                isActive={session.status === 'summarizing'}
                onStart={hasTranscription && !hasSummary && session.status !== 'summarizing' ? () => startProcessingMutation.mutate() : undefined}
              />
              <PipelineStep
                label="Complete"
                status={getStepStatus('complete')}
                isActive={false}
                isLast={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Upload Section - Only show when no upload */}
      {needsAudio && (
        <div className="border-b border-orange-200 bg-orange-50">
          <div className="px-6 py-4">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-orange-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-orange-900 mb-2">
                  No Audio File
                </h3>
                <p className="text-orange-800 mb-4">
                  This session has no audio file attached. Upload an audio
                  recording to generate transcriptions and AI summaries.
                </p>

                {uploadError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-900">
                          Upload Failed
                        </p>
                        <p className="text-sm text-red-700 mt-1">
                          {uploadError}
                        </p>
                      </div>
                      <button
                        onClick={() => setUploadError(null)}
                        className="text-red-600 hover:text-red-800"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {!showExistingUploads ? (
                    <>
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) =>
                            setSelectedFile(e.target.files?.[0] || null)
                          }
                          className="block text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-600 file:text-white hover:file:bg-orange-700 file:cursor-pointer"
                          disabled={isUploadingAudio}
                        />
                        {selectedFile && (
                          <button
                            onClick={() =>
                              uploadAudioMutation.mutate(selectedFile)
                            }
                            disabled={isUploadingAudio}
                            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            {isUploadingAudio ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4" />
                                Upload & Process
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-orange-700">
                        Or{' '}
                        <button
                          onClick={() => setShowExistingUploads(true)}
                          className="underline hover:text-orange-900 font-medium"
                        >
                          link an existing upload
                        </button>
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-orange-900">
                          Select an Upload
                        </h4>
                        <button
                          onClick={() => setShowExistingUploads(false)}
                          className="text-sm text-orange-700 hover:text-orange-900"
                        >
                          Cancel
                        </button>
                      </div>
                      {uploads.length === 0 ? (
                        <p className="text-sm text-orange-700">
                          No existing uploads found.
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto space-y-2 border border-orange-200 rounded-lg p-2 bg-white">
                          {uploads.map((upload) => (
                            <button
                              key={upload.id}
                              onClick={() =>
                                linkExistingUploadMutation.mutate(upload.id)
                              }
                              disabled={linkingUploadId === upload.id}
                              className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {upload.originalName}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                    <span>
                                      {(upload.size / 1024 / 1024).toFixed(2)}{' '}
                                      MB
                                    </span>
                                    {upload.duration && (
                                      <span>
                                        • {Math.floor(upload.duration / 60)}m{' '}
                                        {upload.duration % 60}s
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {linkingUploadId === upload.id ? (
                                  <RefreshCw className="h-4 w-4 text-orange-600 animate-spin flex-shrink-0 ml-2" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {hasError && session.errorMessage && (
        <div className="border-b border-red-200 bg-red-50">
          <div className="px-6 py-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">
                  {session.errorStep?.includes('timeout')
                    ? 'Processing Timeout'
                    : 'Error during ' + (session.errorStep || 'processing')}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  {session.errorMessage}
                </p>
              </div>
              <button
                onClick={() => startProcessingMutation.mutate()}
                disabled={startProcessingMutation.isPending}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {startProcessingMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Three Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Session Navigation */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <Link
              href={`/campaigns/${session.campaign.id}`}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3"
            >
              <BookOpen className="h-4 w-4" />
              <span className="font-medium">{session.campaign.name}</span>
            </Link>
            <div className="text-xs text-gray-500">
              {campaignSessions.length} session
              {campaignSessions.length !== 1 ? 's' : ''} in campaign
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <div className="text-xs font-semibold text-gray-500 uppercase px-2 mb-3">
              All Sessions
            </div>
            {campaignSessions.map((s) => (
              <div
                key={s.id}
                className={`
                group relative rounded-lg mb-2 border-l-4 transition-all
                ${s.id === sessionId
                    ? 'py-4 bg-blue-50 border-l-blue-600 text-blue-900 shadow-sm'
                    : 'py-3 border-l-transparent hover:bg-gray-50 text-gray-700'
                  }
              `}
              >
                <Link href={`/sessions/${s.id}`} className="block px-4">
                  <div
                    className={`mb-2 ${s.id === sessionId ? 'text-base font-bold' : 'text-sm font-medium'}`}
                  >
                    {s.title}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {new Date(s.sessionDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    {s.duration && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatDuration(s.duration)}</span>
                      </div>
                    )}
                    <div
                      className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(s.status)}`}
                    >
                      {s.status}
                    </div>
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSessionToDelete({
                      id: s.id,
                      title: s.title,
                      campaignId: s.campaign.id
                    });
                    setShowDeleteModal(true);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-600 transition-opacity"
                  title="Delete session"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-white">
          {/* Session Header */}
          <div className="border-b border-gray-200 bg-gray-50">
            <div className="px-8 py-4 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {new Date(session.sessionDate).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  {session.duration && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{formatDuration(session.duration)}</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSessionToDelete({
                    id: session.id,
                    title: session.title,
                    campaignId: session.campaign.id
                  });
                  setShowDeleteModal(true);
                }}
                className="px-3 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Session
              </button>
            </div>
          </div>

          {/* Summary Card */}
          <div className="border-b border-gray-200">
            <div className="bg-white p-8">
              <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gray-100">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                  <h2 className="text-2xl font-bold text-gray-900">
                    AI Summary
                  </h2>
                </div>
                <div className="flex gap-2">
                  {summary && (
                    <>
                      {!isEditingSummary && (
                        <button
                          onClick={handleEditSummary}
                          className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => generateSummaryMutation.mutate()}
                        disabled={generateSummaryMutation.isPending}
                        className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${generateSummaryMutation.isPending ? 'animate-spin' : ''}`}
                        />
                        Regenerate
                      </button>
                    </>
                  )}
                </div>
              </div>

              {summary ? (
                isEditingSummary ? (
                  <div className="space-y-4">
                    <textarea
                      value={editedSummaryText}
                      onChange={(e) => setEditedSummaryText(e.target.value)}
                      className="w-full h-64 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditingSummary(false)}
                        className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveSummary}
                        disabled={updateSummaryMutation.isPending}
                        className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {updateSummaryMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-slate max-w-none">
                    <div className="text-gray-700 leading-relaxed text-base max-h-96 overflow-y-auto pr-4 custom-scrollbar">
                      {summary.summaryText}
                    </div>
                    {summary.isEdited && summary.editedAt && (
                      <p className="text-xs text-amber-600 mt-4">
                        Edited {formatDate(summary.editedAt)}
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No summary generated yet</p>
                  {transcriptions.length > 0 && (
                    <button
                      onClick={() => generateSummaryMutation.mutate()}
                      disabled={generateSummaryMutation.isPending}
                      className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      {generateSummaryMutation.isPending
                        ? 'Generating...'
                        : 'Generate Summary'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Transcript Section */}
            <div className="border-t border-gray-200">
              <button
                onClick={() => toggleSection('transcript')}
                className="w-full px-8 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-600" />
                  <span className="font-semibold text-gray-900">
                    Full Transcript
                  </span>
                  <span className="text-sm text-gray-500">
                    ({transcriptions.length} segments)
                  </span>
                </div>
                {expandedSections.has('transcript') ? (
                  <ChevronDown className="h-5 w-5 text-gray-600" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-600" />
                )}
              </button>
              {expandedSections.has('transcript') && (
                <div className="px-8 py-6 bg-gray-50 border-t border-gray-200 max-h-96 overflow-y-auto space-y-4">
                  {transcriptions.map((t) => (
                    <div
                      key={t.id}
                      className="bg-white p-4 border-l-4 border-blue-500"
                    >
                      <div className="text-xs text-gray-500 mb-2">
                        {Math.floor(t.startTime / 60)}:
                        {String(Math.floor(t.startTime % 60)).padStart(2, '0')}{' '}
                        -{Math.floor(t.endTime / 60)}:
                        {String(Math.floor(t.endTime % 60)).padStart(2, '0')}
                      </div>
                      <p className="text-gray-700">{t.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right Panel - TODO List */}
        <aside className="w-96 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">DM Prep TODO</h2>
            </div>
            <div className="flex gap-2 mt-4">
              {dmTodoList && !isEditingTodo && (
                <button
                  onClick={handleEditTodo}
                  className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                >
                  <Edit3 className="h-3 w-3 inline mr-1" />
                  Edit
                </button>
              )}
              <button
                onClick={() => generateTodoMutation.mutate()}
                disabled={generateTodoMutation.isPending}
                className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                <RefreshCw
                  className={`h-3 w-3 inline mr-1 ${generateTodoMutation.isPending ? 'animate-spin' : ''}`}
                />
                {dmTodoList ? 'Regenerate' : 'Generate'}
              </button>
            </div>
          </div>

          <div className="p-6">
            {dmTodoList ? (
              isEditingTodo ? (
                <div className="space-y-4">
                  <textarea
                    value={editedTodoText}
                    onChange={(e) => setEditedTodoText(e.target.value)}
                    className="w-full h-96 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditingTodo(false)}
                      className="flex-1 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveTodo}
                      disabled={updateTodoMutation.isPending}
                      className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                    >
                      {updateTodoMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="prose prose-sm prose-slate max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: marked(dmTodoList.content) as string,
                  }}
                />
              )
            ) : (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-700 mb-4">No TODO list yet</p>
                {transcriptions.length > 0 && (
                  <button
                    onClick={() => generateTodoMutation.mutate()}
                    disabled={generateTodoMutation.isPending}
                    className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    {generateTodoMutation.isPending
                      ? 'Generating...'
                      : 'Generate TODO'}
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && sessionToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Delete Session
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Are you sure you want to delete &quot;{sessionToDelete.title}&quot;? This action cannot be undone and will permanently delete:
                </p>
                <ul className="text-sm text-gray-600 list-disc list-inside space-y-1 mb-4">
                  <li>All transcriptions</li>
                  <li>AI-generated summary</li>
                  <li>DM TODO list</li>
                  <li>Session metadata</li>
                </ul>
                <p className="text-sm text-gray-500 italic">
                  Note: The uploaded audio file will not be deleted and can be reused.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSessionToDelete(null);
                }}
                disabled={deleteSessionMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteSessionMutation.mutate()}
                disabled={deleteSessionMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteSessionMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .border-l-3 {
          border-left-width: 3px;
        }
      `}</style>
    </div>
  );
}

export default function SessionPageRedesign() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <SessionPageRedesignInner />
    </Suspense>
  );
}
