'use client';

import { AlertTriangle, CloudOff, MicOff, Pause, Play, ShieldCheck, Square, WifiOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import { LevelMeter } from '@/components/recording/level-meter';
import { formatHms, safetyState } from '@/lib/recording/safety';
import { cn } from '@/lib/utils';
import type { RecorderEngine } from '@/lib/recording/engine';
import type { RecorderSnapshot } from '@/lib/recording/types';

/** The line that lets a DM trust the app with an irreplaceable evening. */
export function SafetyIndicator({ snapshot }: { snapshot: RecorderSnapshot }) {
  const state = safetyState({
    savedThroughMs: snapshot.savedThroughMs,
    health: snapshot.uploadHealth,
    pendingParts: snapshot.pendingParts,
    storageError: snapshot.storageError,
  });
  const Icon = snapshot.storageError
    ? CloudOff
    : snapshot.uploadHealth === 'offline'
      ? WifiOff
      : state.tone === 'ok'
        ? ShieldCheck
        : AlertTriangle;
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="safety-indicator"
      data-health={snapshot.storageError ? 'storage-error' : snapshot.uploadHealth}
      className={cn(
        'flex items-center gap-2 rounded-ss-lg border px-3 py-2 text-sm font-medium',
        state.tone === 'ok' && 'border-emerald-300 bg-emerald-50 text-emerald-900',
        state.tone === 'warn' && 'border-amber-300 bg-amber-50 text-amber-900',
        state.tone === 'error' && 'border-red-300 bg-red-50 text-red-900'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {state.text}
    </p>
  );
}

function MicLostBanner({ engine, snapshot }: { engine: RecorderEngine; snapshot: RecorderSnapshot }) {
  return (
    <div role="alert" data-testid="mic-lost" className="rounded-ss-lg border-2 border-red-500 bg-red-50 p-4">
      <p className="flex items-center gap-2 font-semibold text-red-900">
        <MicOff className="h-5 w-5" /> Microphone disconnected — audio is NOT being captured.
      </p>
      <p className="mt-1 text-sm text-red-800">
        Everything up to now is saved. Pick a microphone to continue (it starts a new segment).
      </p>
      <select
        aria-label="Choose a microphone"
        defaultValue=""
        onChange={e => e.target.value && void engine.selectDevice(e.target.value)}
        className="mt-3 w-full rounded-ss-lg border border-red-300 bg-white px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Choose a microphone…
        </option>
        {snapshot.devices.map(device => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Elapsed timer, meter, safety indicator, Pause/Resume and Stop. */
export function RecordingHud({ engine, snapshot }: { engine: RecorderEngine; snapshot: RecorderSnapshot }) {
  const paused = snapshot.phase === 'paused';
  const starting = snapshot.phase === 'starting';
  return (
    <div className="bg-white rounded-ss-xl border border-slate-300 p-6 shadow-ss-card space-y-5">
      <span data-testid="recording-id" hidden>
        {snapshot.recordingId ?? ''}
      </span>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'h-3.5 w-3.5 rounded-full',
              paused || snapshot.micLost ? 'bg-slate-400' : 'bg-red-600 animate-pulse'
            )}
          />
          <span className="text-sm font-bold uppercase tracking-[0.12em] text-slate-700">
            {starting ? 'Starting…' : snapshot.micLost ? 'No microphone' : paused ? 'Paused' : 'Recording'}
          </span>
        </div>
        <span data-testid="elapsed" className="font-mono text-4xl font-semibold tabular-nums text-slate-900">
          {formatHms(snapshot.elapsedMs)}
        </span>
      </div>

      <LevelMeter level={paused ? null : snapshot.level} className="h-10" />
      <SafetyIndicator snapshot={snapshot} />
      {snapshot.micLost && <MicLostBanner engine={engine} snapshot={snapshot} />}
      {snapshot.errorMessage && !snapshot.micLost && (
        <p role="alert" className="text-sm text-red-700">
          {snapshot.errorMessage}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 pt-2">
        {paused ? (
          <Button type="button" size="lg" data-testid="resume" onClick={() => engine.resume()}>
            <Play className="h-4 w-4" /> Resume
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            variant="secondary"
            data-testid="pause"
            disabled={starting || snapshot.micLost}
            onClick={() => engine.pause()}
          >
            <Pause className="h-4 w-4" /> Pause
          </Button>
        )}
        {/* Stop sits apart from Pause: one click, no confirm (decision 11). */}
        <Button
          type="button"
          size="lg"
          variant="danger"
          data-testid="stop"
          disabled={snapshot.phase !== 'recording' && snapshot.phase !== 'paused'}
          onClick={() => void engine.stop()}
        >
          <Square className="h-4 w-4 fill-current" /> Stop
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        Segment {snapshot.segmentIndex + 1} · part {snapshot.partIndex + 1}
        {!snapshot.wakeLockActive && ' · Screen may sleep — keep the laptop awake and plugged in.'}
      </p>
    </div>
  );
}
