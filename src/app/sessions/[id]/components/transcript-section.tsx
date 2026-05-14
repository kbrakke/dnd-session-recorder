'use client';

import { useState, useMemo } from 'react';
import { FileText, Search } from 'lucide-react';
import type { Transcription } from '../types';

interface TranscriptSectionProps {
  transcriptions: Transcription[];
  sessionStatus: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * TranscriptSection component displays the session transcript.
 *
 * Empty state shows an informational card (with spinner when transcribing).
 * Filled state shows a searchable table of timestamped transcript segments.
 */
export function TranscriptSection({
  transcriptions,
  sessionStatus,
}: TranscriptSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const isTranscribing = sessionStatus === 'transcribing';

  const filteredTranscriptions = useMemo(() => {
    if (!searchQuery.trim()) return transcriptions;
    const q = searchQuery.toLowerCase();
    return transcriptions.filter((t) => t.text.toLowerCase().includes(q));
  }, [transcriptions, searchQuery]);

  // ── Empty state ──────────────────────────────────────────────
  if (transcriptions.length === 0) {
    return (
      <div style={{ marginTop: 18 }}>
        <div
          style={{
            background: 'var(--sp-bg-surface)',
            border: '1px solid var(--sp-border)',
            borderRadius: 6,
            boxShadow: 'var(--sp-shadow-card)',
            padding: '32px 28px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          {/* Icon plate */}
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              background: 'var(--sp-primary-tint)',
              border: '1px solid var(--sp-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FileText
              size={20}
              style={{
                color: 'var(--sp-primary)',
                animation: isTranscribing ? 'ss-spin 2s linear infinite' : 'none',
              }}
            />
          </div>

          <div>
            <div
              className="font-body"
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                color: 'var(--sp-fg-4)',
                marginBottom: 4,
              }}
            >
              Transcript
            </div>
            <h3
              className="font-display"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--sp-fg-1)',
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {isTranscribing
                ? 'Transcribing in the background\u2026'
                : 'No transcript yet.'}
            </h3>
            <p
              className="font-body"
              style={{
                fontSize: 14,
                color: 'var(--sp-fg-3)',
                margin: '6px 0 0',
                lineHeight: 1.5,
              }}
            >
              {isTranscribing
                ? 'Audio is being split into chunks and sent to the transcription service. This page will update automatically.'
                : 'Upload an audio recording and start processing to generate a transcript.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Filled state ─────────────────────────────────────────────
  return (
    <div style={{ marginTop: 18 }}>
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--sp-fg-4)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          placeholder="Search transcript\u2026"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="font-body"
          style={{
            width: '100%',
            padding: '8px 12px 8px 36px',
            fontSize: 14,
            background: 'var(--sp-bg-surface)',
            border: '1px solid var(--sp-border)',
            borderRadius: 6,
            color: 'var(--sp-fg-1)',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--sp-primary)';
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--sp-primary-tint)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--sp-border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>

      {/* Transcript table card */}
      <div
        style={{
          background: 'var(--sp-bg-surface)',
          border: '1px solid var(--sp-border)',
          borderRadius: 6,
          boxShadow: 'var(--sp-shadow-card)',
          overflow: 'hidden',
        }}
      >
        {/* Result count when filtering */}
        {searchQuery.trim() && (
          <div
            className="font-body"
            style={{
              padding: '8px 16px',
              fontSize: 12,
              color: 'var(--sp-fg-3)',
              borderBottom: '1px solid var(--sp-divider)',
            }}
          >
            {filteredTranscriptions.length} of {transcriptions.length} segments
          </div>
        )}

        {/* Rows */}
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {filteredTranscriptions.length === 0 ? (
            <div
              className="font-body"
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--sp-fg-3)',
                fontSize: 14,
              }}
            >
              No segments match your search.
            </div>
          ) : (
            filteredTranscriptions.map((t, index) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  padding: '10px 16px',
                  background:
                    index % 2 === 1 ? 'var(--sp-bg-sunken)' : 'transparent',
                  borderBottom:
                    index < filteredTranscriptions.length - 1
                      ? '1px solid var(--sp-divider)'
                      : 'none',
                }}
              >
                {/* Time column */}
                <span
                  className="font-mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--sp-fg-4)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    paddingTop: 2,
                    minWidth: 90,
                  }}
                >
                  {formatTime(t.startTime)} - {formatTime(t.endTime)}
                </span>

                {/* Text column */}
                <span
                  className="font-body"
                  style={{
                    fontSize: 14,
                    color: 'var(--sp-fg-2)',
                    lineHeight: 1.55,
                  }}
                >
                  {t.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
