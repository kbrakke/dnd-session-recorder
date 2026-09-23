'use client';

import { useEffect, useState } from 'react';
import { openRecorderStore } from '@/lib/recording/idb-store';
import { bytesToSeconds } from '@/lib/recording/constants';

/**
 * How much of this recording's audio is still ONLY in this browser
 * (IndexedDB rows not yet acknowledged by the server). The session page uses
 * it so "Finalize what's there" never silently skips recoverable audio.
 */
export function useLocalRecordingTail(recordingId: string | null): {
  loading: boolean;
  seconds: number;
} {
  const [state, setState] = useState<{ loading: boolean; seconds: number }>({ loading: true, seconds: 0 });

  useEffect(() => {
    if (!recordingId) {
      setState({ loading: false, seconds: 0 });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const store = await openRecorderStore();
        try {
          const pending = await store.getPendingChunks(recordingId);
          const bytes = pending.reduce((n, c) => n + c.size, 0);
          // Any row counts: round a tiny tail up so it is never reported as 0.
          const seconds = pending.length > 0 ? Math.max(1, bytesToSeconds(bytes)) : 0;
          if (!cancelled) setState({ loading: false, seconds });
        } finally {
          store.close();
        }
      } catch {
        // No readable local storage: nothing recoverable from this browser.
        if (!cancelled) setState({ loading: false, seconds: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recordingId]);

  return state;
}
