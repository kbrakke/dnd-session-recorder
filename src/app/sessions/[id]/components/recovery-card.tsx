'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { formatDurationSeconds } from '@/lib/formatting';
import { isRecorderApiError } from '@/lib/recording/api';
import { useLocalRecordingTail } from '@/components/recording/use-local-recording-tail';
import type { RecordingSummary } from '../types';

const primaryStyle = {
  background: 'var(--sp-primary)',
  color: 'var(--sp-on-primary)',
  border: '1px solid var(--sp-primary-border)',
  boxShadow: 'var(--sp-shadow-btn)',
};
const outlineStyle = { background: 'transparent', color: 'var(--sp-fg-2)', border: '1px solid var(--sp-border)' };
const dangerStyle = { background: 'var(--sp-error-bg)', color: 'var(--sp-error-fg)', border: '1px solid var(--sp-error-bd)' };

interface RecoveryCardProps {
  sessionId: string;
  recording: RecordingSummary;
  onFinalize(force: boolean): void;
  onDiscard(force: boolean): void;
  isFinalizing: boolean;
  isDiscarding: boolean;
  error: unknown;
}

/**
 * Interrupted or failed live recording on the session page. Resume happens
 * in the recorder (it needs the mic); Finalize / Discard run here. A
 * `still_capturing` answer means a tab may still be recording — the user
 * must confirm before the forced retry.
 *
 * Durability: if THIS browser still holds un-uploaded audio for the
 * recording, the primary action is recovering it through the recorder
 * (which drains the tail, then offers Finalize). Finalizing from here
 * without it is an explicit, confirmed choice — never a silent bypass.
 */
export function RecoveryCard({
  sessionId,
  recording,
  onFinalize,
  onDiscard,
  isFinalizing,
  isDiscarding,
  error,
}: RecoveryCardProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmSkipTail, setConfirmSkipTail] = useState(false);
  const failed = recording.status === 'failed';
  // A failed recording can't accept uploads anymore, so a local tail is moot.
  const localTail = useLocalRecordingTail(failed ? null : recording.id);
  const hasLocalTail = !failed && localTail.seconds > 0;
  const stillCapturing = isRecorderApiError(error) && error.kind === 'still-capturing';
  const busy = isFinalizing || isDiscarding;
  const hasAudio = recording.estimatedDurationSeconds > 0;

  return (
    <div
      data-testid="recording-recovery-card"
      className="border-b"
      style={{ background: 'var(--sp-bg-sunken)', borderColor: 'var(--sp-warn-bd, var(--sp-border))' }}
    >
      <div className="px-6 py-4 flex items-start gap-4">
        <AlertTriangle className="h-6 w-6 flex-shrink-0 mt-1" style={{ color: 'var(--sp-error-fg-soft)' }} />
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1 font-display" style={{ color: 'var(--sp-fg-1)' }}>
            {failed ? 'Assembling the recording failed' : 'Interrupted recording'}
          </h3>
          <p className="mb-3 text-sm" style={{ color: 'var(--sp-fg-3)' }}>
            {failed
              ? `${recording.errorMessage ?? 'Something went wrong.'} Your audio is still saved — you can retry.`
              : `${formatDurationSeconds(recording.estimatedDurationSeconds)} captured and saved. Resume, finalize what's there, or discard it.`}
          </p>

          {hasLocalTail && (
            <p className="mb-3 text-sm font-medium" style={{ color: 'var(--sp-fg-1)' }} data-testid="local-tail-notice">
              About {formatDurationSeconds(localTail.seconds)} of audio from this browser hasn’t been uploaded yet.
              Recover it first so it’s included.
            </p>
          )}
          {!failed && !hasLocalTail && !localTail.loading && hasAudio && (
            <p className="mb-3 text-xs" style={{ color: 'var(--sp-fg-3)' }}>
              Finalizing uses the audio already on the server. Anything another device hasn’t uploaded yet won’t be
              included.
            </p>
          )}

          {stillCapturing && (
            <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--sp-error-fg-soft)' }}>
              A tab may still be recording this session. Continuing stops it there, and anything it hasn’t uploaded
              won’t be included.
            </p>
          )}
          {error != null && !stillCapturing && (
            <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--sp-error-fg-soft)' }}>
              {error instanceof Error ? error.message : 'Something went wrong.'}
            </p>
          )}

          {confirmSkipTail ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--sp-fg-2)' }}>
                Finalize without this browser’s {formatDurationSeconds(localTail.seconds)}? It will be lost.
              </span>
              <button
                type="button"
                data-testid="confirm-finalize-without-tail"
                disabled={busy}
                onClick={() => onFinalize(stillCapturing)}
                className="px-3 py-1.5 text-sm font-semibold rounded-[4px] disabled:opacity-50"
                style={dangerStyle}
              >
                Finalize without it
              </button>
              <button
                type="button"
                onClick={() => setConfirmSkipTail(false)}
                className="px-3 py-1.5 text-sm rounded-[4px]"
                style={outlineStyle}
              >
                Cancel
              </button>
            </div>
          ) : confirmDiscard ? (
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--sp-fg-2)' }}>
                This deletes all captured audio. It can’t be undone.
              </span>
              <button
                type="button"
                data-testid="confirm-discard-recording"
                disabled={busy}
                onClick={() => onDiscard(stillCapturing)}
                className="px-3 py-1.5 text-sm font-semibold rounded-[4px] disabled:opacity-50"
                style={dangerStyle}
              >
                {isDiscarding ? 'Discarding…' : 'Discard'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="px-3 py-1.5 text-sm rounded-[4px]"
                style={outlineStyle}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {!failed && (
                <Link
                  href={`/sessions/${sessionId}/record`}
                  data-testid={hasLocalTail ? 'recover-local-tail' : undefined}
                  className="px-4 py-2 text-sm font-semibold rounded-[4px] inline-flex items-center gap-2"
                  style={primaryStyle}
                >
                  {hasLocalTail ? 'Recover this browser’s audio' : 'Resume recording'}
                </Link>
              )}
              {hasAudio && (
                <button
                  type="button"
                  data-testid="finalize-recording"
                  disabled={busy || localTail.loading}
                  onClick={() => (hasLocalTail ? setConfirmSkipTail(true) : onFinalize(stillCapturing))}
                  className="px-4 py-2 text-sm font-semibold rounded-[4px] inline-flex items-center gap-2 disabled:opacity-50"
                  style={failed ? primaryStyle : outlineStyle}
                >
                  {isFinalizing ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  {stillCapturing
                    ? 'Finalize anyway'
                    : failed
                      ? 'Retry assembly'
                      : hasLocalTail
                        ? 'Finalize without it'
                        : 'Finalize what’s there'}
                </button>
              )}
              <button
                type="button"
                data-testid="discard-recording"
                disabled={busy}
                onClick={() => setConfirmDiscard(true)}
                className="px-3 py-2 text-sm font-medium rounded-[4px] inline-flex items-center gap-1.5 disabled:opacity-50"
                style={{ color: 'var(--sp-error-fg-soft)', border: '1px solid var(--sp-border)' }}
              >
                <Trash2 className="h-4 w-4" /> Discard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
