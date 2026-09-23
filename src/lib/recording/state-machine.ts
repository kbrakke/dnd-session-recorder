import type { RecorderPhase, RecordingDisplayStatus } from './types';

export type RecorderEvent =
  | { type: 'UNSUPPORTED' }
  | { type: 'PREFLIGHT_READY' }
  | { type: 'START' }
  | { type: 'STARTED' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'CAPTURE_STOPPED' }
  | { type: 'TAIL_UPLOADED' }
  | { type: 'FINALIZE_POLL'; status: RecordingDisplayStatus }
  | { type: 'FINALIZE_FAILED' }
  | { type: 'FINALIZING' }
  | { type: 'RECOVER' }
  | { type: 'RECOVERY_LOADED' }
  | { type: 'CHOOSE_RESUME' }
  | { type: 'CHOOSE_FINALIZE' }
  | { type: 'CHOOSE_DISCARD' }
  | { type: 'DISCARDED' }
  | { type: 'DISCARD_FAILED' }
  | { type: 'TAKEN_OVER' }
  | { type: 'FATAL' };

export type RecorderEventType = RecorderEvent['type'];

type Table = Partial<Record<RecorderPhase, Partial<Record<RecorderEventType, RecorderPhase>>>>;

/**
 * The full transition table. Anything not listed is invalid. Terminal
 * phases (finalized, discarded, taken-over, unsupported) accept nothing.
 * FINALIZE_POLL is resolved by `transition` from its status, not here.
 */
export const TRANSITIONS: Table = {
  idle: {
    UNSUPPORTED: 'unsupported',
    PREFLIGHT_READY: 'preflight',
    RECOVER: 'recovering',
    FINALIZING: 'finalizing',
    FATAL: 'error',
  },
  preflight: {
    START: 'starting',
    PREFLIGHT_READY: 'preflight',
    UNSUPPORTED: 'unsupported',
    FATAL: 'error',
  },
  starting: {
    STARTED: 'recording',
    TAKEN_OVER: 'taken-over',
    FATAL: 'error',
  },
  recording: {
    PAUSE: 'paused',
    STOP: 'stopping',
    TAKEN_OVER: 'taken-over',
    FATAL: 'error',
  },
  paused: {
    RESUME: 'recording',
    STOP: 'stopping',
    TAKEN_OVER: 'taken-over',
    FATAL: 'error',
  },
  stopping: {
    CAPTURE_STOPPED: 'uploading-tail',
    TAKEN_OVER: 'taken-over',
    FATAL: 'error',
  },
  'uploading-tail': {
    TAIL_UPLOADED: 'finalizing',
    TAKEN_OVER: 'taken-over',
    FATAL: 'error',
  },
  finalizing: {
    FINALIZE_FAILED: 'finalize-failed',
    FATAL: 'error',
  },
  'finalize-failed': {
    CHOOSE_FINALIZE: 'finalizing',
    CHOOSE_DISCARD: 'discarding',
  },
  recovering: {
    RECOVERY_LOADED: 'recovery-choice',
    TAKEN_OVER: 'taken-over',
    FINALIZING: 'finalizing',
    FATAL: 'error',
  },
  'recovery-choice': {
    CHOOSE_RESUME: 'preflight',
    CHOOSE_FINALIZE: 'finalizing',
    CHOOSE_DISCARD: 'discarding',
    RECOVER: 'recovering',
  },
  discarding: {
    DISCARDED: 'discarded',
    DISCARD_FAILED: 'recovery-choice',
    FATAL: 'error',
  },
  error: {
    PREFLIGHT_READY: 'preflight',
    RECOVER: 'recovering',
  },
};

/**
 * Next phase, or null for an invalid transition. Never throws: this runs
 * inside audio and network callbacks, where ignoring a stray event is safer
 * than an exception. Callers log the null.
 */
export function transition(phase: RecorderPhase, event: RecorderEvent): RecorderPhase | null {
  if (event.type === 'FINALIZE_POLL') {
    if (phase !== 'finalizing') return null;
    if (event.status === 'finalized') return 'finalized';
    if (event.status === 'failed') return 'finalize-failed';
    return 'finalizing';
  }
  return TRANSITIONS[phase]?.[event.type] ?? null;
}

/** Phases in which a MediaRecorder may be (about to be) capturing. */
export const CAPTURING_PHASES: readonly RecorderPhase[] = [
  'starting',
  'recording',
  'paused',
  'stopping',
];

/** Phases where closing the tab would lose audio or an upload in flight. */
export const GUARD_UNLOAD_PHASES: readonly RecorderPhase[] = [
  'starting',
  'recording',
  'paused',
  'stopping',
  'uploading-tail',
  'recovering',
];

export const TERMINAL_PHASES: readonly RecorderPhase[] = [
  'finalized',
  'discarded',
  'taken-over',
  'unsupported',
];
