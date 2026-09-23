import { AUDIO_BITS_PER_SECOND, MEDIA_CONSTRAINTS, RECORDING_MIME_TYPE } from './constants';
import type { AudioInputDevice } from './types';

/**
 * Thin, injectable wrappers over getUserMedia / enumerateDevices /
 * AudioContext / MediaRecorder. No module-scope browser access.
 */

// ---------------------------------------------------------------------------
// Microphone
// ---------------------------------------------------------------------------

export type MicErrorKind = 'denied' | 'busy' | 'not-found' | 'unknown';

export class MicError extends Error {
  constructor(public readonly kind: MicErrorKind, message: string) {
    super(message);
    this.name = 'MicError';
  }
}

export function toMicError(error: unknown): MicError {
  if (error instanceof MicError) return error;
  const name = (error as { name?: string } | null)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new MicError(
        'denied',
        'Microphone access was denied. Allow it in your browser’s site settings, then try again.'
      );
    case 'NotReadableError':
    case 'AbortError':
      return new MicError(
        'busy',
        'The microphone is busy in another app (a call or another recorder). Close it and try again.'
      );
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new MicError('not-found', 'No microphone was found. Plug one in and try again.');
    default:
      return new MicError(
        'unknown',
        error instanceof Error ? error.message : 'The microphone could not be opened.'
      );
  }
}

type MediaDevicesLike = Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>;

/**
 * Audio inputs with a usable id. Labels and ids are blank until the page
 * has been granted a stream once — call after `acquireMicStream`. Chrome's
 * 'default' pseudo-device is kept (labelled "Default - <name>"); never
 * assume it is a physical device.
 */
export async function listAudioInputs(md: MediaDevicesLike): Promise<AudioInputDevice[]> {
  const devices = await md.enumerateDevices();
  return devices
    .filter(d => d.kind === 'audioinput' && d.deviceId)
    .map((d, i) => ({
      deviceId: d.deviceId,
      groupId: d.groupId,
      label: d.label || `Microphone ${i + 1}`,
    }));
}

/** A requested id is only used when it is non-empty and currently present. */
export function resolveDeviceId(
  requested: string | null | undefined,
  devices: AudioInputDevice[]
): string | null {
  if (!requested) return null;
  return devices.some(d => d.deviceId === requested) ? requested : null;
}

export interface AcquiredMic {
  stream: MediaStream;
  /** A requested device was unavailable; the browser default was used. */
  fellBack: boolean;
  deviceId: string | null;
  channelCount: number | null;
}

export async function acquireMicStream(
  md: MediaDevicesLike,
  deviceId: string | null
): Promise<AcquiredMic> {
  const constraints = (id: string | null): MediaStreamConstraints => ({
    audio: { ...MEDIA_CONSTRAINTS, ...(id ? { deviceId: { exact: id } } : {}) },
  });

  let stream: MediaStream;
  let fellBack = false;
  try {
    stream = await md.getUserMedia(constraints(deviceId));
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
      try {
        stream = await md.getUserMedia(constraints(null));
        fellBack = true;
      } catch (retryError) {
        throw toMicError(retryError);
      }
    } else {
      throw toMicError(error);
    }
  }

  const settings = stream.getAudioTracks()[0]?.getSettings?.() ?? {};
  return {
    stream,
    fellBack,
    deviceId: settings.deviceId ?? null,
    channelCount: typeof settings.channelCount === 'number' ? settings.channelCount : null,
  };
}

// ---------------------------------------------------------------------------
// Level meter
// ---------------------------------------------------------------------------

export interface LevelMeter {
  /** Root-mean-square input level (0..~1), or null while the context is suspended. */
  readRms(): number | null;
  /** Disconnect and close the context. NEVER stops the stream's tracks. */
  dispose(): Promise<void>;
}

type AudioContextCtor = new () => Pick<
  AudioContext,
  'createMediaStreamSource' | 'createAnalyser' | 'close' | 'state' | 'resume'
>;

/**
 * Build AFTER getUserMedia resolves: browsers exempt an actively capturing
 * page from the autoplay gate, so the context starts 'running' without a
 * gesture. Metering only — never connect to the destination (feedback) and
 * never record from the graph (MediaRecorder takes the raw stream).
 */
export function createLevelMeter(stream: MediaStream, AC: AudioContextCtor): LevelMeter {
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  return {
    readRms() {
      if (ctx.state !== 'running') return null;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    },
    async dispose() {
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
      if (ctx.state !== 'closed') await ctx.close().catch(() => undefined);
    },
  };
}

// ---------------------------------------------------------------------------
// Segment runs (one MediaRecorder instance = one segment)
// ---------------------------------------------------------------------------

export type StopReason = 'user-stop' | 'rotate' | 'pause-timeout' | 'mic-change' | 'device-lost';

export interface MediaRecorderLike {
  readonly state: 'inactive' | 'recording' | 'paused';
  start(timeslice?: number): void;
  stop(): void;
  pause(): void;
  resume(): void;
  requestData(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export type MediaRecorderCtor = new (
  stream: MediaStream,
  options?: MediaRecorderOptions
) => MediaRecorderLike;

export interface SegmentRunHandlers {
  /** A non-empty blob for THIS run's segment (closure-bound). */
  onChunk(blob: Blob, capturedAt: number): void;
  /** The run ended. `device-lost` means nobody asked it to stop. */
  onStopped(reason: StopReason): void;
  onError(error: unknown): void;
}

export interface SegmentRun {
  readonly segmentIndex: number;
  readonly startedAt: number;
  readonly state: 'inactive' | 'recording' | 'paused';
  readonly stopReason: StopReason | null;
  start(timesliceMs: number): void;
  pause(): void;
  resume(): void;
  requestData(): void;
  /** Resolves after `onstop` (the final dataavailable precedes it). */
  stop(reason: StopReason): Promise<void>;
}

/**
 * One continuous MediaRecorder run. Only its first blob carries the WebM
 * header, so a segment is exactly this run's blobs, in order. The handlers
 * close over `segmentIndex`: the final blob that arrives asynchronously after
 * `stop()` always lands on THIS segment, even if a newer run already started.
 * The stop reason lives on this instance, never on shared engine state.
 */
export function createSegmentRun(opts: {
  stream: MediaStream;
  segmentIndex: number;
  handlers: SegmentRunHandlers;
  now: () => number;
  MediaRecorder: MediaRecorderCtor;
  mimeType?: string;
  audioBitsPerSecond?: number;
}): SegmentRun {
  const recorder = new opts.MediaRecorder(opts.stream, {
    mimeType: opts.mimeType ?? RECORDING_MIME_TYPE,
    audioBitsPerSecond: opts.audioBitsPerSecond ?? AUDIO_BITS_PER_SECOND,
  });

  let stopReason: StopReason | null = null;
  let startedAt = 0;
  let started = false;
  let stopFired = false;
  let resolveStopped!: () => void;
  const stopped = new Promise<void>(resolve => {
    resolveStopped = resolve;
  });

  recorder.ondataavailable = event => {
    // MediaRecorder can emit empty blobs around requestData/pause/stop; the
    // server rejects empty parts, so they never enter the pipeline.
    if (event.data && event.data.size > 0) opts.handlers.onChunk(event.data, opts.now());
  };
  recorder.onstop = () => {
    if (stopFired) return;
    stopFired = true;
    opts.handlers.onStopped(stopReason ?? 'device-lost');
    resolveStopped();
  };
  recorder.onerror = event => opts.handlers.onError(event);

  return {
    segmentIndex: opts.segmentIndex,
    get startedAt() {
      return startedAt;
    },
    get state() {
      return recorder.state;
    },
    get stopReason() {
      return stopReason;
    },
    start(timesliceMs) {
      if (started) return;
      started = true;
      startedAt = opts.now();
      recorder.start(timesliceMs);
    },
    pause() {
      if (recorder.state === 'recording') recorder.pause();
    },
    resume() {
      if (recorder.state === 'paused') recorder.resume();
    },
    requestData() {
      if (recorder.state !== 'inactive') recorder.requestData();
    },
    stop(reason) {
      stopReason ??= reason;
      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else if (!started || stopFired) {
        // Never started, or already ended on its own: nothing to wait for.
        if (!stopFired) {
          stopFired = true;
          resolveStopped();
        }
      }
      return stopped;
    },
  };
}
