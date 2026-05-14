'use client';

import { useState } from 'react';
import { Sparkles, Edit3, Save, RefreshCw, Download } from 'lucide-react';
import type { Summary } from '../types';

interface SummarySectionProps {
  summary: Summary | null;
  sessionStatus: string;
  onSave: (text: string) => void;
  onRegenerate: () => void;
  isSaving: boolean;
  isRegenerating: boolean;
  hasTranscriptions: boolean;
}

export function SummarySection({
  summary,
  sessionStatus,
  onSave,
  onRegenerate,
  isSaving,
  isRegenerating,
  hasTranscriptions,
}: SummarySectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const handleStartEdit = () => {
    if (summary) {
      setEditText(summary.summaryText);
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    await onSave(editText);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditText('');
  };

  const handleExport = () => {
    if (!summary) return;
    const blob = new Blob([summary.summaryText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'session-summary.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const transcriptReady = hasTranscriptions || sessionStatus === 'transcribed' || sessionStatus === 'completed';

  // ── Empty state ──────────────────────────────────────────────────────
  if (!summary) {
    return (
      <div style={{ marginTop: 18 }}>
        <div
          style={{
            backgroundColor: 'var(--sp-bg-surface)',
            border: '1px solid var(--sp-border)',
            borderRadius: 8,
            padding: '36px 32px',
            boxShadow: 'var(--sp-shadow-card)',
          }}
        >
          <div className="flex items-start gap-4">
            {/* Icon plate */}
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 4,
                backgroundColor: 'var(--sp-manuscript-bg)',
              }}
            >
              <Sparkles
                className="h-5 w-5"
                style={{ color: 'var(--sp-gold)' }}
              />
            </div>

            <div className="min-w-0 flex-1">
              {/* Eyebrow */}
              <p
                className="font-body text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--sp-gold)', marginBottom: 6 }}
              >
                AI Summary
              </p>

              {/* Heading */}
              <h3
                className="font-display text-xl font-bold"
                style={{ color: 'var(--sp-fg-1)', marginBottom: 8 }}
              >
                {transcriptReady
                  ? 'Ready to scribe this session.'
                  : 'Waiting on transcript.'}
              </h3>

              {/* Body */}
              <p
                className="font-body text-sm leading-relaxed"
                style={{ color: 'var(--sp-fg-3)', maxWidth: 520 }}
              >
                {transcriptReady
                  ? 'Generate an AI-powered narrative summary of everything that happened during this session. You can edit and regenerate it any time.'
                  : 'Once the transcript is ready, you can generate a narrative summary of the session here.'}
              </p>

              {/* Actions */}
              {transcriptReady && (
                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-opacity duration-150 disabled:opacity-60"
                    style={{
                      backgroundColor: 'var(--sp-primary)',
                      color: 'var(--sp-on-primary)',
                      boxShadow: 'var(--sp-shadow-btn)',
                    }}
                  >
                    {isRegenerating ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isRegenerating ? 'Generating...' : 'Generate summary'}
                  </button>

                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-opacity duration-150 hover:opacity-80"
                    style={{ color: 'var(--sp-fg-3)' }}
                  >
                    Customize prompt
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Filled state ─────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 18, animation: 'ss-fade 200ms ease' }}>
      <div
        style={{
          backgroundColor: 'var(--sp-manuscript-bg)',
          border: '1px solid var(--sp-manuscript-border)',
          borderRadius: 8,
          backgroundImage: [
            'radial-gradient(ellipse at 20% 0%, rgba(200,155,60,0.06) 0%, transparent 60%)',
            'radial-gradient(ellipse at 80% 100%, rgba(200,155,60,0.04) 0%, transparent 60%)',
          ].join(', '),
          padding: '28px 32px 32px',
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          {/* Eyebrow */}
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-4 w-4"
              style={{ color: 'var(--sp-gold)' }}
            />
            <span
              className="font-body text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--sp-gold)' }}
            >
              AI-Generated Summary
            </span>
          </div>

          {/* Action buttons */}
          {!isEditing && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 disabled:opacity-60"
                style={{
                  color: 'var(--sp-manuscript-ink)',
                  border: '1px solid var(--sp-manuscript-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(200,155,60,0.10)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`}
                />
                Regenerate
              </button>

              <button
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors duration-150"
                style={{
                  color: 'var(--sp-manuscript-ink)',
                  border: '1px solid var(--sp-manuscript-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(200,155,60,0.10)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit
              </button>

              <button
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors duration-150"
                style={{
                  color: 'var(--sp-manuscript-ink)',
                  border: '1px solid var(--sp-manuscript-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(200,155,60,0.10)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            backgroundColor: 'var(--sp-manuscript-border)',
            marginBottom: 24,
            opacity: 0.6,
          }}
        />

        {/* Content: editing or reading */}
        {isEditing ? (
          <div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full resize-none font-display leading-relaxed focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[--sp-gold]"
              style={{
                fontSize: 17,
                color: 'var(--sp-manuscript-ink)',
                backgroundColor: 'transparent',
                border: '1px solid var(--sp-manuscript-border)',
                borderRadius: 6,
                padding: '16px 18px',
                minHeight: 260,
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium rounded-md transition-opacity duration-150 hover:opacity-80"
                style={{
                  color: 'var(--sp-manuscript-ink)',
                  border: '1px solid var(--sp-manuscript-border)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-opacity duration-150 disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--sp-primary)',
                  color: 'var(--sp-on-primary)',
                  boxShadow: 'var(--sp-shadow-btn)',
                }}
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="font-display leading-relaxed whitespace-pre-wrap"
            style={{
              fontSize: 17,
              color: 'var(--sp-manuscript-ink)',
            }}
          >
            {summary.summaryText}

            {summary.isEdited && summary.editedAt && (
              <p
                className="font-body text-xs italic mt-6"
                style={{ color: 'var(--sp-fg-4)' }}
              >
                Edited{' '}
                {new Date(summary.editedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
