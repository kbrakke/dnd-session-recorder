'use client';

import { Trash2, RefreshCw } from 'lucide-react';
import type { SessionToDelete } from '../types';

interface DeleteSessionModalProps {
  isOpen: boolean;
  session: SessionToDelete | null;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export function DeleteSessionModal({
  isOpen,
  session,
  onConfirm,
  onCancel,
  isDeleting,
}: DeleteSessionModalProps) {
  if (!isOpen || !session) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(15, 23, 42, 0.5)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-[8px] p-7 max-w-md w-full border"
        style={{
          background: 'var(--sp-bg-surface)',
          borderColor: 'var(--sp-border-strong)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 0 0 rgba(15,23,42,0.06), 0 24px 40px -12px rgba(15,23,42,0.22)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-[4px] flex items-center justify-center"
            style={{
              background: 'var(--sp-error-bg)',
              border: '1px solid var(--sp-error-bd)',
            }}
          >
            <Trash2 className="h-5 w-5" style={{ color: 'var(--sp-error-fg)' }} />
          </div>
          <div className="flex-1">
            <h3
              className="text-lg font-semibold mb-2 font-display"
              style={{ color: 'var(--sp-fg-1)' }}
            >
              Delete session
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--sp-fg-3)' }}>
              Are you sure you want to delete &quot;{session.title}&quot;? This
              action cannot be undone and will permanently delete:
            </p>
            <ul
              className="text-sm list-disc list-inside space-y-1 mb-4"
              style={{ color: 'var(--sp-fg-3)' }}
            >
              <li>All transcriptions</li>
              <li>AI-generated summary</li>
              <li>DM TODO list</li>
              <li>Session metadata</li>
            </ul>
            <p
              className="text-sm italic"
              style={{ color: 'var(--sp-fg-4)' }}
            >
              The uploaded audio file will not be deleted and can be reused.
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 text-sm font-semibold rounded-[4px] border hover:opacity-80 disabled:opacity-50"
            style={{
              color: 'var(--sp-fg-1)',
              background: 'var(--sp-bg-sunken)',
              borderColor: 'var(--sp-border-strong)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 text-sm font-semibold rounded-[4px] border hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: 'var(--sp-error-bg)',
              color: 'var(--sp-error-fg)',
              borderColor: 'var(--sp-error-bd)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
            }}
          >
            {isDeleting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete session
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
