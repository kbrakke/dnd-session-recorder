'use client';

import { AlertCircle, BatteryCharging, Loader2, Mic, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import { LevelMeter } from './level-meter';
import { UnsupportedBrowser } from './unsupported-browser';
import type { Preflight } from './use-preflight';

export interface PreflightPanelProps {
  preflight: Preflight;
  primaryLabel: string;
  onPrimary(): void;
  primaryDisabled?: boolean;
  busy?: boolean;
  /** Error from the start attempt itself (API), shown above the button. */
  startError?: string | null;
}

/**
 * Mic picker + live level meter + the standing reminders, shared by the new
 * session page and the session record page (fresh start and Resume).
 */
export function PreflightPanel({
  preflight,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  busy,
  startError,
}: PreflightPanelProps) {
  if (preflight.status === 'unsupported') {
    return <UnsupportedBrowser reasons={preflight.reasons} />;
  }

  const ready = preflight.status === 'ready';

  return (
    <div className="bg-white rounded-ss-xl border border-slate-300 p-6 shadow-ss-card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 font-display flex items-center gap-2">
          <Mic className="h-5 w-5 text-ink-900" /> Microphone check
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Talk or tap the table — the meter should move before you start.
        </p>
      </div>

      {(preflight.status === 'checking' || preflight.status === 'requesting') && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          {preflight.status === 'checking' ? 'Checking this browser…' : 'Waiting for microphone permission…'}
        </p>
      )}

      {preflight.status === 'error' && (
        <div role="alert" className="rounded-ss-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p>{preflight.error}</p>
            <button type="button" onClick={preflight.retry} className="mt-2 font-semibold underline">
              Try again
            </button>
          </div>
        </div>
      )}

      {ready && (
        <div className="space-y-3">
          <label htmlFor="mic-picker" className="block text-sm font-medium text-slate-700">
            Microphone
          </label>
          <select
            id="mic-picker"
            aria-label="Microphone"
            data-testid="mic-picker"
            value={preflight.selectedDeviceId ?? ''}
            onChange={e => preflight.selectDevice(e.target.value)}
            className="w-full rounded-ss-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900/20"
          >
            {preflight.devices.length === 0 && <option value="">Default microphone</option>}
            {preflight.devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          {preflight.fellBack && (
            <p className="text-xs text-amber-700">Your saved microphone isn’t available — using the default.</p>
          )}
          <LevelMeter level={preflight.level} />
        </div>
      )}

      <ul className="space-y-2 text-sm text-slate-700">
        <li className="flex items-start gap-2">
          <BatteryCharging className="h-4 w-4 mt-0.5 text-slate-500 shrink-0" />
          Keep this tab open and your laptop plugged in.
          {!preflight.wakeLockSupported && ' This browser can’t keep the screen awake — turn off sleep in your settings.'}
        </li>
        <li className="flex items-start gap-2">
          <Users className="h-4 w-4 mt-0.5 text-slate-500 shrink-0" />
          Make sure your table knows the session is recorded.
        </li>
      </ul>

      {startError && (
        <p role="alert" className="text-sm text-red-700">
          {startError}
        </p>
      )}

      <Button
        type="button"
        size="lg"
        data-testid="preflight-primary"
        onClick={onPrimary}
        disabled={!ready || primaryDisabled || busy}
        className="w-full"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-2.5 w-2.5 rounded-full bg-red-500" />}
        {primaryLabel}
      </Button>
    </div>
  );
}
