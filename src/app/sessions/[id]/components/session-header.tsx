'use client';

import { Calendar, Clock, BookOpen, FileText, Download, Edit, Trash2 } from 'lucide-react';
import type { SessionDetail, SessionStatus } from '../types';
import StatusPill from '@/components/ui/StatusPill';
import { formatDate, formatDurationMinutes } from '@/lib/formatting';

interface SessionHeaderProps {
  session: SessionDetail;
  onDelete: () => void;
  transcriptionCount?: number;
}

function mapStatusToPill(status: SessionStatus): string {
  switch (status) {
    case 'uploaded':
      return 'pending';
    case 'transcribing':
      return 'processing';
    case 'transcribed':
      return 'completed';
    case 'summarizing':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'draft':
    default:
      return 'pending';
  }
}

export function SessionHeader({ session, onDelete, transcriptionCount }: SessionHeaderProps) {
  const duration = formatDurationMinutes(session.duration);
  const parts = transcriptionCount ?? session._count?.transcriptions ?? 0;

  return (
    <div className="flex items-start justify-between gap-6 py-6">
      {/* Left side: title, status, meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1
            className="font-display text-[34px] font-bold leading-tight truncate"
            style={{ color: 'var(--sp-fg-1)' }}
          >
            {session.title}
          </h1>
          <StatusPill status={mapStatusToPill(session.status)} className="shrink-0" />
        </div>

        <div
          className="flex items-center gap-5 mt-2 text-sm font-body"
          style={{ color: 'var(--sp-fg-3)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{session.campaign.name}</span>
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDate(session.sessionDate, 'long')}</span>
          </span>

          {duration && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{duration}</span>
            </span>
          )}

          {parts > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span>
                {parts} {parts === 1 ? 'part' : 'parts'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Right side: action buttons */}
      <div className="flex items-center gap-2 shrink-0 pt-1">
        <button
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-ss-lg transition-colors duration-150"
          style={{
            color: 'var(--sp-fg-2)',
            border: '1px solid var(--sp-border)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--sp-bg-sunken)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>

        <button
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-ss-lg transition-colors duration-150"
          style={{
            color: 'var(--sp-fg-2)',
            border: '1px solid var(--sp-border)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--sp-bg-sunken)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <Edit className="h-3.5 w-3.5" />
          Edit
        </button>

        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-ss-lg transition-colors duration-150"
          style={{
            color: 'var(--sp-error-fg-soft)',
            border: '1px solid var(--sp-border)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--sp-error-bg)';
            e.currentTarget.style.color = 'var(--sp-error-fg)';
            e.currentTarget.style.borderColor = 'var(--sp-error-bd)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--sp-error-fg-soft)';
            e.currentTarget.style.borderColor = 'var(--sp-border)';
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
