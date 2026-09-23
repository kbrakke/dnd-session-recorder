'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import Button from '@/components/ui/Button';
import { SafetyIndicator } from './recording-hud';
import type { RecorderEngine } from '@/lib/recording/engine';
import type { RecorderSnapshot } from '@/lib/recording/types';

/** After Stop: uploading the tail, then the finalize job assembling audio. */
export function AssemblingState({ engine, snapshot }: { engine: RecorderEngine; snapshot: RecorderSnapshot }) {
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [confirm, setConfirm] = useState<'loss' | 'discard' | null>(null);
  const uploading = snapshot.phase === 'stopping' || snapshot.phase === 'uploading-tail';

  if (snapshot.phase === 'tail-blocked') {
    const u = snapshot.unresolved;
    return (
      <div data-testid="tail-blocked" className="rounded-ss-xl border border-amber-300 bg-amber-50 p-6 space-y-4">
        <p className="flex items-center gap-2 text-lg font-semibold text-slate-900 font-display">
          <AlertTriangle className="h-5 w-5 text-amber-700" /> Some audio couldn’t be uploaded
        </p>
        <p className="text-sm text-slate-700">
          The server refused {u?.parts ?? 'some'} part{u?.parts === 1 ? '' : 's'} (about {u?.seconds ?? '?'} s). It’s still
          saved in this browser. Finalizing now would leave a gap — nothing after it in that segment can be included.
        </p>
        {snapshot.lastUploadError && <p className="text-xs text-slate-500">Server said: {snapshot.lastUploadError}</p>}
        {confirm === 'loss' && (
          <div className="rounded-ss-lg border border-red-300 bg-white p-3 text-sm text-red-900 space-y-2">
            <p>Finalize without that audio? It will be lost for good.</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="danger" data-testid="confirm-finalize-loss" onClick={() => void engine.finalizeAcceptingLoss()}>
                Finalize without it
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            </div>
          </div>
        )}
        {confirm === 'discard' && (
          <div className="rounded-ss-lg border border-red-300 bg-white p-3 text-sm text-red-900 space-y-2">
            <p>This deletes all captured audio for this session. It can’t be undone.</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="danger" onClick={() => void engine.chooseDiscard()}>Discard</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            </div>
          </div>
        )}
        {confirm === null && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" data-testid="retry-tail" onClick={() => void engine.retryTail()}>
              <RotateCcw className="h-4 w-4" /> Retry upload
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirm('loss')}>
              Finalize without it
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm('discard')}>
              <Trash2 className="h-4 w-4" /> Discard
            </Button>
          </div>
        )}
      </div>
    );
  }

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
        {snapshot.phase === 'stopping' && snapshot.stopStalled && (
          <div data-testid="stop-stalled" className="rounded-ss-lg border border-amber-300 bg-amber-50 p-3 text-sm text-slate-800 space-y-2">
            <p>
              The browser’s recorder hasn’t handed over its last few seconds of audio yet. Still waiting — nothing is
              finalized until it does.
            </p>
            {confirm === 'loss' ? (
              <div className="space-y-2 text-red-900">
                <p>Finalize without that audio? Whatever the recorder hasn’t delivered will be lost for good.</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="danger" data-testid="confirm-abandon-stalled" onClick={() => engine.abandonStalledStop()}>
                    Finalize without it
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(null)}>Keep waiting</Button>
                </div>
              </div>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirm('loss')}>
                Finalize without it
              </Button>
            )}
          </div>
        )}
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
