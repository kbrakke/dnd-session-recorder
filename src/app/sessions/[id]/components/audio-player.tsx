'use client';

import { Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  uploadId: string;
  /** Duration in seconds, when known. */
  duration?: number | null;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Inline player for the session's original audio recording.
 * Streams from /api/uploads/[id]/audio (presigned Tigris URL in production,
 * local file streaming in dev).
 */
export function AudioPlayer({ uploadId, duration }: AudioPlayerProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-4 py-3 my-4"
      style={{
        background: 'var(--sp-bg-raised)',
        borderColor: 'var(--sp-border)',
      }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <Volume2 className="w-4 h-4" style={{ color: 'var(--sp-primary)' }} />
        <span
          className="text-sm font-body font-medium"
          style={{ color: 'var(--sp-fg-2)' }}
        >
          Session recording
          {duration ? (
            <span style={{ color: 'var(--sp-fg-3)' }}> · {formatDuration(duration)}</span>
          ) : null}
        </span>
      </div>
      <audio
        controls
        preload="metadata"
        className="w-full h-9"
        src={`/api/uploads/${uploadId}/audio`}
      />
    </div>
  );
}
