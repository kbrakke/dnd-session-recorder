'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { activeRecorderEngine, subscribeRegistry } from '@/lib/recording/engine-registry';
import { formatHms } from '@/lib/recording/safety';
import type { RecorderSnapshot } from '@/lib/recording/types';

const getActive = (): RecorderSnapshot | null => activeRecorderEngine()?.getSnapshot() ?? null;
const getServer = (): RecorderSnapshot | null => null;

/**
 * Global "● Recording 1:23:45" pill: in-app navigation does not stop the
 * recorder (it lives in the registry), so wherever the DM wanders this links
 * back to the HUD.
 */
export function RecordingIndicator() {
  const pathname = usePathname();
  const snap = useSyncExternalStore(subscribeRegistry, getActive, getServer);
  if (!snap) return null;
  const href = `/sessions/${snap.sessionId}/record`;
  if (pathname === href) return null;

  const uploading = snap.phase === 'stopping' || snap.phase === 'uploading-tail';
  return (
    <Link
      href={href}
      data-testid="recording-indicator"
      className="inline-flex items-center gap-2 rounded-ss-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
    >
      <span className={`h-2.5 w-2.5 rounded-full bg-red-600 ${snap.phase === 'recording' ? 'animate-pulse' : ''}`} />
      {uploading ? 'Saving recording…' : snap.phase === 'paused' ? 'Paused' : 'Recording'}
      {!uploading && <span className="font-mono tabular-nums">{formatHms(snap.elapsedMs)}</span>}
    </Link>
  );
}
