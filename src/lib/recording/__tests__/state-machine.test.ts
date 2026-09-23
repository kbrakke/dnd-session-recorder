import { describe, expect, it } from 'vitest';
import { TERMINAL_PHASES, TRANSITIONS, transition } from '../state-machine';
import type { RecorderEvent, RecorderEventType } from '../state-machine';
import type { RecorderPhase } from '../types';

const ALL_EVENTS: RecorderEventType[] = [
  'UNSUPPORTED', 'PREFLIGHT_READY', 'START', 'STARTED', 'PAUSE', 'RESUME', 'STOP',
  'CAPTURE_STOPPED', 'TAIL_UPLOADED', 'FINALIZE_FAILED', 'FINALIZING', 'RECOVER',
  'RECOVERY_LOADED', 'CHOOSE_RESUME', 'CHOOSE_FINALIZE', 'CHOOSE_DISCARD', 'DISCARDED',
  'DISCARD_FAILED', 'TAKEN_OVER', 'FATAL',
];

const ev = (type: RecorderEventType) => ({ type }) as RecorderEvent;

describe('transition', () => {
  it('follows the happy path', () => {
    const path: Array<[RecorderPhase, RecorderEventType, RecorderPhase]> = [
      ['idle', 'PREFLIGHT_READY', 'preflight'],
      ['preflight', 'START', 'starting'],
      ['starting', 'STARTED', 'recording'],
      ['recording', 'PAUSE', 'paused'],
      ['paused', 'RESUME', 'recording'],
      ['recording', 'STOP', 'stopping'],
      ['stopping', 'CAPTURE_STOPPED', 'uploading-tail'],
      ['uploading-tail', 'TAIL_UPLOADED', 'finalizing'],
    ];
    for (const [from, e, to] of path) expect(transition(from, ev(e))).toBe(to);
  });

  it('a fresh start goes idle → starting (the pre-flight hook owns the stream)', () => {
    expect(transition('idle', ev('START'))).toBe('starting');
  });

  it('resolves FINALIZE_POLL by status', () => {
    expect(transition('finalizing', { type: 'FINALIZE_POLL', status: 'finalized' })).toBe('finalized');
    expect(transition('finalizing', { type: 'FINALIZE_POLL', status: 'failed' })).toBe('finalize-failed');
    expect(transition('finalizing', { type: 'FINALIZE_POLL', status: 'finalizing' })).toBe('finalizing');
    expect(transition('recording', { type: 'FINALIZE_POLL', status: 'finalized' })).toBeNull();
  });

  it('covers recovery and discard', () => {
    expect(transition('idle', ev('RECOVER'))).toBe('recovering');
    expect(transition('recovering', ev('RECOVERY_LOADED'))).toBe('recovery-choice');
    expect(transition('recovery-choice', ev('CHOOSE_RESUME'))).toBe('preflight');
    expect(transition('recovery-choice', ev('CHOOSE_FINALIZE'))).toBe('finalizing');
    expect(transition('recovery-choice', ev('RECOVER'))).toBe('recovering');
    expect(transition('recovery-choice', ev('CHOOSE_DISCARD'))).toBe('discarding');
    expect(transition('discarding', ev('DISCARDED'))).toBe('discarded');
    expect(transition('discarding', ev('DISCARD_FAILED'))).toBe('recovery-choice');
    expect(transition('finalize-failed', ev('CHOOSE_FINALIZE'))).toBe('finalizing');
    expect(transition('idle', ev('FINALIZING'))).toBe('finalizing');
  });

  it('takeover is reachable from every capturing phase', () => {
    for (const p of ['starting', 'recording', 'paused', 'stopping', 'uploading-tail'] as RecorderPhase[]) {
      expect(transition(p, ev('TAKEN_OVER'))).toBe('taken-over');
    }
  });

  it('returns null (never throws) for invalid transitions', () => {
    expect(transition('idle', ev('STOP'))).toBeNull();
    expect(transition('preflight', ev('PAUSE'))).toBeNull();
    expect(transition('paused', ev('PAUSE'))).toBeNull();
    expect(transition('finalizing', ev('STOP'))).toBeNull();
  });

  it('terminal phases accept nothing', () => {
    for (const phase of TERMINAL_PHASES) {
      for (const e of ALL_EVENTS) expect(transition(phase, ev(e))).toBeNull();
    }
  });

  it('the table has no transitions out of terminal phases', () => {
    for (const phase of TERMINAL_PHASES) expect(TRANSITIONS[phase]).toBeUndefined();
  });
});
