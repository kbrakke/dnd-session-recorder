'use client';

import Link from 'next/link';
import { BookOpen, Calendar, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Campaign, GamingSession } from '../types';

interface SessionsRailProps {
  open: boolean;
  onToggle: () => void;
  campaign: Campaign | null;
  sessions: GamingSession[];
  activeSessionId: string;
  onPickSession: (id: string) => void;
}

/** Format a date string into an abbreviated month + day, e.g. "Jan 5". */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * SessionSidebar — a collapsible sessions rail on the left side of the
 * session detail page.  Collapsed (default) shows date chips; expanded shows
 * full session list with campaign info.
 */
export function SessionSidebar({
  open,
  onToggle,
  campaign,
  sessions,
  activeSessionId,
  onPickSession,
}: SessionsRailProps) {
  /* ------------------------------------------------------------------ */
  /*  Collapsed rail                                                     */
  /* ------------------------------------------------------------------ */
  if (!open) {
    // Show at most 5 session chips
    const visibleSessions = sessions.slice(0, 5);

    return (
      <aside
        className="shrink-0 flex flex-col items-center gap-2 py-3 border-r sticky top-[80px] self-start"
        style={{
          width: 56,
          borderColor: 'var(--sp-border)',
          backgroundColor: 'var(--sp-bg-surface)',
        }}
      >
        {/* Toggle open */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center rounded-md transition-colors hover:opacity-80"
          style={{
            width: 40,
            height: 36,
            color: 'var(--sp-text-secondary)',
            backgroundColor: 'var(--sp-bg-sunken)',
          }}
          aria-label="Expand session rail"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div
          className="w-8"
          style={{ height: 1, backgroundColor: 'var(--sp-border)' }}
        />

        {/* Session date chips */}
        {visibleSessions.map((s) => {
          const isActive = s.id === activeSessionId;
          return (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                onPickSession(s.id);
              }}
              className={cn(
                'rounded-md text-[10px] font-body font-semibold leading-none',
                'flex items-center justify-center transition-colors',
              )}
              style={{
                width: 40,
                height: 34,
                backgroundColor: isActive
                  ? 'var(--sp-primary)'
                  : 'var(--sp-bg-sunken)',
                color: isActive
                  ? 'var(--sp-on-primary)'
                  : 'var(--sp-text-secondary)',
              }}
              title={s.title}
            >
              {shortDate(s.sessionDate)}
            </Link>
          );
        })}
      </aside>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Expanded rail                                                      */
  /* ------------------------------------------------------------------ */
  return (
    <aside
      className="shrink-0 flex flex-col border-r sticky top-[80px] self-start overflow-y-auto"
      style={{
        width: 244,
        maxHeight: 'calc(100vh - 80px)',
        borderColor: 'var(--sp-border)',
        backgroundColor: 'var(--sp-bg-surface)',
      }}
    >
      {/* Campaign header */}
      {campaign && (
        <div
          className="px-4 pt-4 pb-3 border-b"
          style={{ borderColor: 'var(--sp-border)' }}
        >
          <span
            className="block text-[10px] font-body font-semibold uppercase tracking-widest mb-1"
            style={{ color: 'var(--sp-text-muted)' }}
          >
            Campaign
          </span>
          <div className="flex items-center gap-2">
            <BookOpen
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--sp-primary)' }}
            />
            <span
              className="text-sm font-display font-semibold truncate"
              style={{ color: 'var(--sp-text-primary)' }}
            >
              {campaign.name}
            </span>
          </div>
        </div>
      )}

      {/* Collapse button */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--sp-border)' }}
      >
        <span
          className="text-[10px] font-body font-semibold uppercase tracking-widest"
          style={{ color: 'var(--sp-text-muted)' }}
        >
          Sessions ({sessions.length})
        </span>
        <button
          onClick={onToggle}
          className="flex items-center justify-center rounded-md transition-colors hover:opacity-80"
          style={{
            width: 28,
            height: 28,
            color: 'var(--sp-text-secondary)',
          }}
          aria-label="Collapse session rail"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.map((s) => {
          const isActive = s.id === activeSessionId;
          return (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                onPickSession(s.id);
              }}
              className={cn(
                'block mx-2 mb-1 px-3 py-2.5 rounded-lg transition-colors',
                'hover:opacity-90',
              )}
              style={{
                backgroundColor: isActive
                  ? 'var(--sp-bg-active)'
                  : 'transparent',
                borderLeft: isActive
                  ? '3px solid var(--sp-primary-border)'
                  : '3px solid transparent',
              }}
            >
              <span
                className={cn(
                  'block text-sm font-body truncate',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
                style={{
                  color: isActive
                    ? 'var(--sp-text-primary)'
                    : 'var(--sp-text-secondary)',
                }}
              >
                {s.title}
              </span>

              <div className="flex items-center gap-2 mt-1">
                <Calendar
                  className="w-3 h-3 shrink-0"
                  style={{ color: 'var(--sp-text-muted)' }}
                />
                <span
                  className="text-xs font-body"
                  style={{ color: 'var(--sp-text-muted)' }}
                >
                  {shortDate(s.sessionDate)}
                </span>
                <span
                  className="text-[10px] font-body font-medium px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'var(--sp-bg-sunken)',
                    color: 'var(--sp-text-muted)',
                  }}
                >
                  {s.status}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* New session button */}
      {campaign && (
        <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--sp-border)' }}>
          <Link
            href={`/campaigns/${campaign.id}`}
            className={cn(
              'flex items-center justify-center gap-1.5 w-full py-2 rounded-lg',
              'text-xs font-body font-medium transition-colors hover:opacity-80',
            )}
            style={{
              color: 'var(--sp-primary)',
              border: '1px dashed var(--sp-border)',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            New session in campaign
          </Link>
        </div>
      )}
    </aside>
  );
}
