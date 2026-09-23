'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, MonitorSmartphone, RotateCcw, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { formatDurationSeconds } from '@/lib/formatting';
import type { RecorderEngine } from '@/lib/recording/engine';
import type { RecorderSnapshot } from '@/lib/recording/types';

function secondsAgo(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 90 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
}

/**
 * Recovery choices after an interruption, a live-elsewhere recording, or a
 * failed assembly. Destructive or disruptive actions confirm inline.
 */
export function RecoveryPanel({ engine, snapshot, sessionId }: {
  engine: RecorderEngine;
  snapshot: RecorderSnapshot;
  sessionId: string;
}) {
  const [confirm, setConfirm] = useState<'takeover' | 'discard' | 'finalize' | 'loss' | null>(null);
  const recovery = snapshot.recovery;
  const finalizeFailed = snapshot.phase === 'finalize-failed';
  const discarding = snapshot.phase === 'discarding';

  if (snapshot.phase === 'recovering') {
    const d = recovery?.drained;
    return (
      <div className="bg-white rounded-ss-xl border border-slate-300 p-8 shadow-ss-card text-center space-y-3" data-testid="recovering">
        <Loader2 className="h-8 w-8 animate-spin text-ink-900 mx-auto" />
        <p className="text-lg font-semibold text-slate-900 font-display">Re-uploading audio saved in this browser…</p>
        {d && d.total > 0 && <p className="text-sm text-slate-600">{d.done} / {d.total} parts</p>}
      </div>
    );
  }

  const mode = finalizeFailed ? 'failed' : recovery?.mode ?? 'interrupted';
  const captured = recovery?.captured ?? null;
  const duration = captured ? formatDurationSeconds(captured.estimatedDurationSeconds) : null;
  const liveElsewhere = mode === 'live-elsewhere';
  const nothingCaptured = snapshot.finalize.nothingCaptured;

  const title = nothingCaptured
    ? 'Nothing was recorded'
    : mode === 'failed'
      ? 'Assembling the recording failed'
      : liveElsewhere
        ? 'This session is being recorded in another tab'
        : 'Interrupted recording';

  const body = nothingCaptured
    ? 'No audio reached the server. Discard this attempt and start again.'
    : mode === 'failed'
      ? `${snapshot.finalize.errorMessage ?? recovery?.captured?.errorMessage ?? 'Something went wrong while assembling.'} Your audio is still saved — you can retry.`
      : liveElsewhere
        ? `Recording may be active in another tab or device — or this tab was reloaded. Last heard from it ${secondsAgo(captured?.lastHeartbeatAt) ?? 'recently'}.`
        : `${duration ?? 'Some audio'} captured and saved on the server.`;

  return (
    <div data-testid="recovery-card" data-mode={nothingCaptured ? 'nothing' : mode} className="rounded-ss-xl border border-amber-300 bg-amber-50 p-6 space-y-4">
      <div className="flex items-start gap-3">
        {liveElsewhere ? (
          <MonitorSmartphone className="h-6 w-6 text-amber-700 shrink-0" />
        ) : (
          <AlertTriangle className="h-6 w-6 text-amber-700 shrink-0" />
        )}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 font-display">{title}</h2>
          <p className="mt-1 text-sm text-slate-700">{body}</p>
          {recovery && recovery.drained.total > 0 && (
            <p className="mt-1 text-sm text-emerald-800">
              Recovered {recovery.drained.done} unsaved part{recovery.drained.done === 1 ? '' : 's'} from this browser.
            </p>
          )}
          {recovery && recovery.unresolvedSeconds > 0 && (
            <p className="mt-1 text-sm text-red-800">
              About {formatDurationSeconds(recovery.unresolvedSeconds)} saved in this browser was refused by the server.
            </p>
          )}
          {recovery && recovery.strandedSeconds > 0 && (
            <p className="mt-1 text-sm text-red-800">
              About {formatDurationSeconds(recovery.strandedSeconds)} of audio from this browser could not be attached.
            </p>
          )}
          {snapshot.errorMessage && (
            <p role="alert" className="mt-2 text-sm text-red-700">{snapshot.errorMessage}</p>
          )}
        </div>
      </div>

      {confirm === 'takeover' && (
        <div className="rounded-ss-lg border border-amber-400 bg-white p-3 text-sm text-slate-800 space-y-2">
          <p>Taking over stops the recording in the other tab. Everything it already uploaded is kept.</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" data-testid="confirm-takeover" onClick={() => engine.chooseResume()}>
              Take over
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {confirm === 'loss' && (
        <div className="rounded-ss-lg border border-red-300 bg-white p-3 text-sm text-red-900 space-y-2">
          <p>
            About {recovery?.unresolvedSeconds} s of audio saved in this browser was refused by the server and won’t be
            included — nor anything after it in that segment. Finalize anyway?
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="danger" data-testid="confirm-finalize-loss" onClick={() => void engine.chooseFinalize()}>
              Finalize without it
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {confirm === 'finalize' && (
        <div className="rounded-ss-lg border border-amber-400 bg-white p-3 text-sm text-slate-800 space-y-2">
          <p>The other tab will stop recording, and anything it hasn’t uploaded yet won’t be included.</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" data-testid="confirm-finalize" onClick={() => void engine.chooseFinalize()}>
              Finalize anyway
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {confirm === 'discard' && (
        <div className="rounded-ss-lg border border-red-300 bg-white p-3 text-sm text-red-900 space-y-2">
          <p>This deletes all captured audio for this session. It can’t be undone.</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="danger" data-testid="confirm-discard" disabled={discarding} onClick={() => void engine.chooseDiscard()}>
              {discarding ? 'Discarding…' : 'Discard'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {confirm === null && (
        <div className="flex flex-wrap items-center gap-2">
          {mode !== 'failed' && !nothingCaptured && (
            <Button
              type="button"
              data-testid={liveElsewhere ? 'recovery-takeover' : 'recovery-resume'}
              onClick={() => (liveElsewhere ? setConfirm('takeover') : engine.chooseResume())}
            >
              {liveElsewhere ? 'Take over in this tab' : 'Resume recording'}
            </Button>
          )}
          {!nothingCaptured && (
            <Button
              type="button"
              variant={mode === 'failed' ? 'primary' : 'outline'}
              data-testid="recovery-finalize"
              onClick={() =>
                liveElsewhere
                  ? setConfirm('finalize')
                  : recovery && recovery.unresolvedSeconds > 0
                    ? setConfirm('loss')
                    : void engine.chooseFinalize()
              }
            >
              <RotateCcw className="h-4 w-4" />
              {mode === 'failed' ? 'Retry assembly' : 'Finalize what’s there'}
            </Button>
          )}
          <Button type="button" variant="ghost" data-testid="recovery-discard" onClick={() => setConfirm('discard')}>
            <Trash2 className="h-4 w-4" /> Discard
          </Button>
          <Link href={`/sessions/${sessionId}`} className="ml-auto text-sm text-slate-600 hover:text-ink-900">
            Back to session
          </Link>
        </div>
      )}
    </div>
  );
}
