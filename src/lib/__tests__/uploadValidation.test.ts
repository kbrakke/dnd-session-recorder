import { describe, it, expect } from 'vitest';
import { isAllowedMime } from '@/lib/uploadValidation';

describe('isAllowedMime', () => {
  it('accepts plain allowed audio types', () => {
    expect(isAllowedMime('audio/webm')).toBe(true);
    expect(isAllowedMime('audio/mpeg')).toBe(true);
    expect(isAllowedMime('audio/mp4')).toBe(true);
  });

  it('accepts codec-qualified types from MediaRecorder', () => {
    expect(isAllowedMime('audio/webm;codecs=opus')).toBe(true);
    expect(isAllowedMime('audio/ogg;codecs=opus')).toBe(true);
    expect(isAllowedMime('audio/mp4; codecs=mp4a.40.2')).toBe(true);
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(isAllowedMime('AUDIO/WEBM')).toBe(true);
    expect(isAllowedMime('  audio/webm ; codecs=opus')).toBe(true);
  });

  it('rejects non-audio and unknown types', () => {
    expect(isAllowedMime('video/webm')).toBe(false);
    expect(isAllowedMime('application/octet-stream')).toBe(false);
    expect(isAllowedMime('')).toBe(false);
  });

  it('rejects types containing control characters', () => {
    expect(isAllowedMime('audio/webm\nContent-Type: text/html')).toBe(false);
    expect(isAllowedMime('audio/webm\u0000')).toBe(false);
  });
});
