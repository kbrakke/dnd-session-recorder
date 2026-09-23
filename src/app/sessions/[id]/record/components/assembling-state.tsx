'use client';

import { useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import Button from '@/components/ui/Button';
import { SafetyIndicator } from './recording-hud';
import type { RecorderEngine } from '@/lib/recording/engine';
import type { RecorderSnapshot } from '@/lib/recording/types';

/** After Stop: uploading the tail, then the finalize job assembling audio. */
export function AssemblingState({ engine, snapshot }: { engine: RecorderEngine; snapshot: RecorderSnapshot }) {
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const uploading = snapshot.phase === 'stopping' || snapshot.phase === 'uploading-tail';

  if (uploading) {
    return (
      <div className="bg-white rounded-ss-xl border border-slate-300 p-6 shadow-ss-card space-y-4" data-testid="uploading-tail">
        <p className="flex items-center gap-2 text-lg font-semibold text-slate-900 font-display">
          <UploadCloud className="h-5 w-5 text-ink-900" /> Uploading remaining audio…
        </p>
        <p className="text-sm text-slate-600">
          {snapshot.pendingParts > 0
            ? `${snapshot.pendingParts} part${snapshot.pendingParts === 1 ? '' : 's'} left. Keep this tab open.`
            : 'Finishing up. Keep this tab open.'}
        </p>
        <SafetyIndicator snapshot={snapshot} />
        {snapshot.abandonAvailable && !confirmAbandon && (
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAbandon(true)}>
            Finalize without the un-uploaded audio
          </Button>
        )}
        {confirmAbandon && (
          <div className="rounded-ss-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 space-y-2">
            <p>
              The audio that hasn’t uploaded yet will be lost for good. Only do this if this device can’t get back online.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="danger" size="sm" onClick={() => engine.abandonTailAndFinalize()}>
                Finalize now
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAbandon(false)}>
                Keep uploading
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const attempts = snapshot.finalize.attempts;
  return (
    <div
      data-testid="assembling"
      className="bg-white rounded-ss-xl border border-slate-300 p-10 shadow-ss-card text-center space-y-3"
    >
      <Loader2 className="h-10 w-10 animate-spin text-ink-900 mx-auto" />
      <p className="text-lg font-semibold text-slate-900 font-display">Assembling your recording…</p>
      <p className="text-sm text-slate-600">
        {attempts && attempts > 1
          ? `Retrying (attempt ${attempts}) — your audio is safe on the server.`
          : 'This takes a few seconds to a minute. Transcription starts automatically afterward.'}
      </p>
    </div>
  );
}
