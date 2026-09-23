'use client';

import Link from 'next/link';
import { Loader2, Mic, Pause } from 'lucide-react';
import type { RecordingSummary } from '../types';

const primaryStyle = {
  background: 'var(--sp-primary)',
  color: 'var(--sp-on-primary)',
  border: '1px solid var(--sp-primary-border)',
  boxShadow: 'var(--sp-shadow-btn)',
};

/**
 * Read-only strip for a recording that is live (possibly in another tab) or
 * being assembled. It never mounts the recorder — that is /record's job.
 */
export function RecordingBanner({ sessionId, recording }: { sessionId: string; recording: RecordingSummary }) {
  const assembling = recording.status === 'finalizing';
  const title = assembling
    ? 'Assembling your recording…'
    : recording.status === 'paused'
      ? 'Recording paused'
      : '● Recording in progress';
  const Icon = assembling ? Loader2 : recording.status === 'paused' ? Pause : Mic;

  return (
    <div
      data-testid="recording-banner"
      className="border-b"
      style={{ background: 'var(--sp-bg-sunken)', borderColor: 'var(--sp-border)' }}
    >
      <div className="px-6 py-4 flex items-start gap-4">
        <Icon
          className={`h-6 w-6 flex-shrink-0 mt-1 ${assembling ? 'animate-spin' : ''}`}
          style={{ color: 'var(--sp-primary)' }}
        />
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1 font-display" style={{ color: 'var(--sp-fg-1)' }}>
            {title}
          </h3>
          <p className="text-sm" style={{ color: 'var(--sp-fg-3)' }}>
            {assembling
              ? 'This takes a few seconds to a minute. Transcription starts automatically afterward.'
              : 'Open the recorder to pause, resume, or stop.'}
          </p>
        </div>
        {!assembling && (
          <Link
            href={`/sessions/${sessionId}/record`}
            className="px-4 py-2 text-sm font-semibold rounded-[4px] inline-flex items-center gap-2 shrink-0"
            style={primaryStyle}
          >
            Open recorder
          </Link>
        )}
      </div>
    </div>
  );
}
