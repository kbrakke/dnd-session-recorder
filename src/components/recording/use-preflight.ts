'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkRecordingSupport } from '@/lib/recording/capabilities';
import {
  acquireMicStream,
  createLevelMeter,
  listAudioInputs,
  resolveDeviceId,
  toMicError,
} from '@/lib/recording/capture';
import type { AudioContextCtor, LevelMeter } from '@/lib/recording/capture';
import { RMS_SAMPLE_MS } from '@/lib/recording/constants';
import type { AudioInputDevice } from '@/lib/recording/types';

const SAVED_DEVICE_KEY = 'recorder-mic';

export type PreflightStatus = 'checking' | 'unsupported' | 'requesting' | 'ready' | 'error';

export interface Preflight {
  status: PreflightStatus;
  reasons: string[];
  wakeLockSupported: boolean;
  devices: AudioInputDevice[];
  selectedDeviceId: string | null;
  /** 0..1 for the meter, or null while unknown. */
  level: number | null;
  error: string | null;
  fellBack: boolean;
  selectDevice(deviceId: string): void;
  retry(): void;
  /**
   * Hand the live stream to the recorder engine. The hook stops metering and
   * will no longer stop the tracks on unmount.
   */
  detachStream(): { stream: MediaStream; deviceId: string | null } | null;
}

function readSavedDevice(): string | null {
  try {
    return window.localStorage.getItem(SAVED_DEVICE_KEY);
  } catch {
    return null;
  }
}

function saveDevice(deviceId: string | null): void {
  try {
    if (deviceId) window.localStorage.setItem(SAVED_DEVICE_KEY, deviceId);
  } catch {
    // storage blocked: the choice just isn't remembered
  }
}

/**
 * Pre-flight: capability hard-block, microphone permission + picker, and a
 * live level meter, so the DM SEES signal before the session starts. Owns the
 * stream until `detachStream()`; StrictMode-safe (a stream that resolves
 * after cleanup is stopped immediately).
 */
export function usePreflight(enabled: boolean = true): Preflight {
  const [status, setStatus] = useState<PreflightStatus>('checking');
  const [reasons, setReasons] = useState<string[]>([]);
  const [wakeLockSupported, setWakeLockSupported] = useState(true);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [requestedDevice, setRequestedDevice] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);
  const detachedRef = useRef(false);
  const selectedRef = useRef<string | null>(null);

  const release = useCallback(() => {
    void meterRef.current?.dispose();
    meterRef.current = null;
    if (!detachedRef.current) streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    detachedRef.current = false;

    (async () => {
      setStatus('checking');
      const report = await checkRecordingSupport();
      if (cancelled) return;
      setWakeLockSupported(report.wakeLock);
      if (!report.supported) {
        setReasons(report.reasons);
        setStatus('unsupported');
        return;
      }

      setStatus('requesting');
      try {
        const md = navigator.mediaDevices;
        // Labels/ids are blank until permission: resolve the saved/requested
        // id against the list only after a first grant.
        const known = await listAudioInputs(md).catch(() => []);
        const wanted = resolveDeviceId(requestedDevice ?? readSavedDevice(), known);
        const acquired = await acquireMicStream(md, wanted);
        if (cancelled) {
          acquired.stream.getTracks().forEach(t => t.stop());
          return;
        }
        release();
        streamRef.current = acquired.stream;
        const list = await listAudioInputs(md).catch(() => []);
        if (cancelled) return;
        setDevices(list);
        setFellBack(acquired.fellBack);
        const chosen = acquired.deviceId ?? wanted;
        selectedRef.current = chosen;
        setSelectedDeviceId(chosen);
        saveDevice(chosen);

        const AC = (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
          | AudioContextCtor
          | undefined;
        if (AC) {
          try {
            meterRef.current = createLevelMeter(acquired.stream, AC);
          } catch {
            meterRef.current = null;
          }
        }
        timer = setInterval(() => {
          const rms = meterRef.current?.readRms() ?? null;
          setLevel(rms === null ? null : Math.min(1, rms * 8));
        }, RMS_SAMPLE_MS);
        setError(null);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(toMicError(e).message);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      release();
    };
  }, [enabled, attempt, requestedDevice, release]);

  const selectDevice = useCallback((deviceId: string) => {
    if (deviceId === selectedRef.current) return;
    setRequestedDevice(deviceId);
  }, []);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  const detachStream = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return null;
    detachedRef.current = true;
    void meterRef.current?.dispose();
    meterRef.current = null;
    streamRef.current = null;
    return { stream, deviceId: selectedRef.current };
  }, []);

  return {
    status,
    reasons,
    wakeLockSupported,
    devices,
    selectedDeviceId,
    level,
    error,
    fellBack,
    selectDevice,
    retry,
    detachStream,
  };
}
