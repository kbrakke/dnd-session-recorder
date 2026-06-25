'use client';

import { Check, Clock, Play, X } from 'lucide-react';
import type { SessionDetail, Transcription, Summary, DmTodoList } from '../types';

interface ProcessingPipelineProps {
  session: SessionDetail;
  transcriptions: Transcription[];
  summary: Summary | null;
  dmTodoList: DmTodoList | null;
  isInitialProcessing: boolean;
  onStartProcessing: () => void;
  onCancelTranscription: () => void;
  isStarting?: boolean;
  isCancelling?: boolean;
}

type StepStatus = 'pending' | 'active' | 'complete' | 'error';

const STEPS = ['Upload', 'Transcribe', 'Summarize', 'Ready'] as const;

/**
 * ProcessingPipeline — slim horizontal strip showing the 4-step processing workflow.
 *
 * Renders only while the session is still being processed; returns null once
 * upload + transcriptions + summary + DM TODOs are all present.
 */
export function ProcessingPipeline({
  session,
  transcriptions,
  summary,
  dmTodoList,
  isInitialProcessing,
  onStartProcessing,
  onCancelTranscription,
  isStarting = false,
  isCancelling = false,
}: ProcessingPipelineProps) {
  const hasUpload = !!session.uploadId;
  const hasTranscription = transcriptions.length > 0;
  const hasSummary = !!summary;
  const hasTodos = !!dmTodoList;
  const isComplete = hasUpload && hasTranscription && hasSummary && hasTodos;

  if (isComplete) return null;

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  const hasError = session.status === 'error';

  const getStepStatus = (
    step: 'Upload' | 'Transcribe' | 'Summarize' | 'Ready',
  ): StepStatus => {
    if (hasError) {
      if (step === 'Transcribe' && session.errorStep?.includes('transcri')) return 'error';
      if (step === 'Summarize' && session.errorStep?.includes('summar')) return 'error';
    }

    switch (step) {
      case 'Upload':
        return hasUpload ? 'complete' : 'pending';
      case 'Transcribe':
        if (hasTranscription) return 'complete';
        if (session.status === 'transcribing') return 'active';
        if (isInitialProcessing && session.status === 'uploaded') return 'active';
        return 'pending';
      case 'Summarize':
        if (hasSummary) return 'complete';
        if (session.status === 'summarizing') return 'active';
        return 'pending';
      case 'Ready':
        return isComplete ? 'complete' : 'pending';
    }
  };

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  const isInFlight =
    session.status === 'transcribing' ||
    session.status === 'summarizing' ||
    (isInitialProcessing && session.status === 'uploaded');

  const estimatedMinutesRemaining = (() => {
    if (!isInFlight || !session.processingStartedAt) return null;

    const elapsedMs =
      Date.now() - new Date(session.processingStartedAt).getTime();
    const elapsedMin = elapsedMs / 60_000;

    // During transcription, use chunk progress to estimate
    if (
      session.status === 'transcribing' &&
      session.totalChunks &&
      session.chunksCompleted != null &&
      session.chunksCompleted > 0
    ) {
      const fractionDone = session.chunksCompleted / session.totalChunks;
      const totalEstimate = elapsedMin / fractionDone;
      const remaining = Math.max(1, Math.ceil(totalEstimate - elapsedMin));
      return remaining;
    }

    // Fallback: if we have transcriptionProgress percentage
    if (
      session.transcriptionProgress &&
      session.transcriptionProgress > 0 &&
      session.transcriptionProgress < 100
    ) {
      const fractionDone = session.transcriptionProgress / 100;
      const totalEstimate = elapsedMin / fractionDone;
      const remaining = Math.max(1, Math.ceil(totalEstimate - elapsedMin));
      return remaining;
    }

    return null;
  })();

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  const statuses: StepStatus[] = STEPS.map(getStepStatus);

  return (
    <div
      style={{
        background: 'var(--sp-bg-surface)',
        borderBottom: '1px solid var(--sp-border)',
        boxShadow: 'var(--sp-shadow-card)',
        fontFamily: 'var(--sp-sans, "Source Sans 3", system-ui, sans-serif)',
      }}
    >
      <div
        style={{ padding: '10px 24px' }}
        className="flex items-center gap-6"
      >
        {/* Eyebrow label */}
        <span
          className="shrink-0 text-[10px] font-bold tracking-[0.12em] uppercase"
          style={{ color: 'var(--sp-fg-4)' }}
        >
          Pipeline
        </span>

        {/* Steps */}
        <div className="flex items-center gap-0 flex-1 min-w-0">
          {STEPS.map((label, i) => {
            const status = statuses[i];
            const isActive = status === 'active';
            const isDone = status === 'complete';
            const isLast = i === STEPS.length - 1;

            return (
              <div key={label} className="flex items-center">
                {/* Step circle + label */}
                <div className="flex items-center gap-1.5">
                  <StepCircle
                    index={i + 1}
                    status={status}
                  />
                  <span
                    className="text-xs whitespace-nowrap"
                    style={{
                      color: isActive
                        ? 'var(--sp-primary)'
                        : isDone
                          ? 'var(--sp-fg-1)'
                          : 'var(--sp-fg-4)',
                      fontWeight: isActive ? 700 : isDone ? 500 : 400,
                    }}
                  >
                    {label}
                  </span>
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div
                    style={{
                      width: 32,
                      height: 2,
                      marginLeft: 8,
                      marginRight: 8,
                      borderRadius: 1,
                      background: isDone
                        ? 'var(--sp-primary)'
                        : 'var(--sp-divider)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Estimated time remaining */}
        {isInFlight && estimatedMinutesRemaining !== null && (
          <span
            className="shrink-0 flex items-center gap-1 text-[11px]"
            style={{ color: 'var(--sp-fg-3)' }}
          >
            <Clock size={12} />
            ~{estimatedMinutesRemaining} min remaining
          </span>
        )}

        {/* Stalled in 'uploaded': the enqueue sets an optimistic in-flight
            status, so a session still 'uploaded' has no active job — offer a
            manual start. */}
        {session.status === 'uploaded' && hasUpload && (
          <button
            onClick={onStartProcessing}
            disabled={isStarting}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{
              background: 'var(--sp-primary)',
              color: 'var(--sp-on-primary)',
            }}
          >
            <Play size={12} strokeWidth={2.5} />
            {isStarting ? 'Starting…' : 'Start processing'}
          </button>
        )}

        {(session.status === 'transcribing' || session.status === 'summarizing') && (
          <button
            onClick={onCancelTranscription}
            disabled={isCancelling}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{
              background: 'transparent',
              color: 'var(--sp-fg-3)',
              border: '1px solid var(--sp-border)',
            }}
          >
            <X size={12} strokeWidth={2.5} />
            {isCancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepCircle — 18px indicator circle
// ---------------------------------------------------------------------------

function StepCircle({
  index,
  status,
}: {
  index: number;
  status: StepStatus;
}) {
  const size = 18;

  const commonStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
  };

  // Complete — filled primary with check
  if (status === 'complete') {
    return (
      <div
        style={{
          ...commonStyle,
          background: 'var(--sp-primary)',
          color: 'var(--sp-on-primary)',
        }}
      >
        <Check size={11} strokeWidth={3} />
      </div>
    );
  }

  // Active — spinning ring
  if (status === 'active') {
    return (
      <div
        style={{
          ...commonStyle,
          border: '2px solid var(--sp-primary)',
          color: 'var(--sp-primary)',
          position: 'relative',
          background: 'transparent',
        }}
      >
        {/* Spinning arc overlay */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 animate-spin"
          style={{ animationDuration: '1.2s' }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 2}
            fill="none"
            stroke="var(--sp-primary)"
            strokeWidth={2}
            strokeDasharray={`${Math.PI * (size - 4) * 0.3} ${Math.PI * (size - 4) * 0.7}`}
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // Error — red outline with number
  if (status === 'error') {
    return (
      <div
        style={{
          ...commonStyle,
          border: '2px solid #ef4444',
          color: '#ef4444',
          background: 'transparent',
        }}
      >
        {index}
      </div>
    );
  }

  // Pending — muted outline with number
  return (
    <div
      style={{
        ...commonStyle,
        border: '2px solid var(--sp-divider)',
        color: 'var(--sp-fg-4)',
        background: 'transparent',
      }}
    >
      {index}
    </div>
  );
}
