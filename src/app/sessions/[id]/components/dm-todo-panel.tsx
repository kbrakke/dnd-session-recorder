'use client';

import { useState } from 'react';
import { CheckCircle, Edit3, RefreshCw, Save } from 'lucide-react';
import { marked } from 'marked';
import type { DmTodoList } from '../types';

interface DMTodoPanelProps {
  todoList: DmTodoList | null;
  sessionStatus: string;
  onSave: (text: string) => void;
  onRegenerate: () => void;
  isSaving: boolean;
  isRegenerating: boolean;
  hasTranscriptions: boolean;
}

/**
 * DMTodoPanel component displays and allows editing of the DM TODO list.
 *
 * Now rendered as main-area tab content (no longer a sidebar aside).
 * Shows markdown-formatted TODO list with edit and regenerate capabilities.
 */
export function DMTodoPanel({
  todoList,
  sessionStatus,
  onSave,
  onRegenerate,
  isSaving,
  isRegenerating,
  hasTranscriptions,
}: DMTodoPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const handleStartEdit = () => {
    if (todoList) {
      setEditText(todoList.content);
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

  const taskCount = todoList
    ? todoList.content.split('\n').filter((line) => /^\s*[-*]\s/.test(line)).length
    : 0;

  const canGenerate =
    hasTranscriptions &&
    (sessionStatus === 'transcribed' ||
      sessionStatus === 'summarizing' ||
      sessionStatus === 'completed');

  if (!todoList) {
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
            <CheckCircle size={20} style={{ color: 'var(--sp-primary)' }} />
          </div>

          <div style={{ flex: 1 }}>
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
              DM Prep Tasks
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
              {canGenerate
                ? 'Get a head start on next session.'
                : 'Available after transcript.'}
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
              {canGenerate
                ? 'Generate a prep list pulled from this session\u2019s transcript\u2014NPCs to follow up on, plot threads to prepare, and loose ends to tie.'
                : 'Once the transcript is ready, you can generate a task list to help prepare for your next session.'}
            </p>

            {canGenerate && (
              <button
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="font-body"
                style={{
                  marginTop: 16,
                  padding: '8px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'var(--sp-primary)',
                  color: 'var(--sp-on-primary)',
                  border: '1px solid var(--sp-primary-border)',
                  borderRadius: 4,
                  boxShadow: 'var(--sp-shadow-btn)',
                  cursor: isRegenerating ? 'not-allowed' : 'pointer',
                  opacity: isRegenerating ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isRegenerating && (
                  <RefreshCw
                    size={14}
                    style={{ animation: 'ss-spin 1s linear infinite' }}
                  />
                )}
                {isRegenerating ? 'Generating\u2026' : 'Generate tasks'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 18 }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span
          className="font-body"
          style={{ fontSize: 13, color: 'var(--sp-fg-3)' }}
        >
          {taskCount > 0 ? `${taskCount} tasks` : 'Tasks'} &middot; pulled from
          this session&rsquo;s transcript
        </span>

        <div style={{ display: 'flex', gap: 6 }}>
          {!isEditing && (
            <button
              onClick={handleStartEdit}
              className="font-body"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                fontSize: 13,
                color: 'var(--sp-fg-3)',
                background: 'transparent',
                border: '1px solid var(--sp-border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              <Edit3 size={13} />
              Edit
            </button>
          )}
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="font-body"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              fontSize: 13,
              color: 'var(--sp-fg-3)',
              background: 'transparent',
              border: '1px solid var(--sp-border)',
              borderRadius: 4,
              cursor: isRegenerating ? 'not-allowed' : 'pointer',
              opacity: isRegenerating ? 0.7 : 1,
            }}
          >
            <RefreshCw
              size={13}
              style={{
                animation: isRegenerating ? 'ss-spin 1s linear infinite' : 'none',
              }}
            />
            Regenerate
          </button>
        </div>
      </div>

      {/* Content card */}
      <div
        style={{
          background: 'var(--sp-bg-surface)',
          border: '1px solid var(--sp-border)',
          borderRadius: 6,
          boxShadow: 'var(--sp-shadow-card)',
          overflow: 'hidden',
        }}
      >
        {isEditing ? (
          <div style={{ padding: 16 }}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="font-mono"
              style={{
                width: '100%',
                minHeight: 320,
                padding: 12,
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--sp-fg-1)',
                background: 'var(--sp-bg-sunken)',
                border: '1px solid var(--sp-border)',
                borderRadius: 4,
                resize: 'vertical',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--sp-primary)';
                e.currentTarget.style.boxShadow =
                  '0 0 0 3px var(--sp-primary-tint)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--sp-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                marginTop: 12,
              }}
            >
              <button
                onClick={handleCancel}
                className="font-body"
                style={{
                  padding: '7px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--sp-fg-2)',
                  background: 'transparent',
                  border: '1px solid var(--sp-border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="font-body"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '7px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'var(--sp-primary)',
                  color: 'var(--sp-on-primary)',
                  border: '1px solid var(--sp-primary-border)',
                  borderRadius: 4,
                  boxShadow: 'var(--sp-shadow-btn)',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                <Save size={13} />
                {isSaving ? 'Saving\u2026' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="font-body prose prose-sm max-w-none"
            style={{
              padding: '20px 24px',
              color: 'var(--sp-fg-2)',
              fontSize: 14,
              lineHeight: 1.65,
            }}
            dangerouslySetInnerHTML={{
              __html: marked(todoList.content) as string,
            }}
          />
        )}
      </div>
    </div>
  );
}
