import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isAiMocked, transcribeAudio, generateAiText } from '@/lib/ai';

describe('ai service wrapper (mock mode)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('MOCK_AI_SERVICES', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isAiMocked', () => {
    it('is true when MOCK_AI_SERVICES=true', () => {
      expect(isAiMocked()).toBe(true);
    });

    it('is false when MOCK_AI_SERVICES is unset or any other value', () => {
      vi.stubEnv('MOCK_AI_SERVICES', '');
      expect(isAiMocked()).toBe(false);
      vi.stubEnv('MOCK_AI_SERVICES', 'false');
      expect(isAiMocked()).toBe(false);
      vi.stubEnv('MOCK_AI_SERVICES', '1');
      expect(isAiMocked()).toBe(false);
    });
  });

  describe('transcribeAudio', () => {
    it('returns a deterministic transcript without hitting OpenAI', async () => {
      const first = await transcribeAudio(Buffer.from('ignored'));
      const second = await transcribeAudio(Buffer.from('different bytes'));

      expect(first.text).toBeTruthy();
      expect(first.text).toEqual(second.text);
    });
  });

  describe('generateAiText', () => {
    it('returns distinct deterministic text per kind', async () => {
      const summary = await generateAiText('any prompt', 'summary');
      const todo = await generateAiText('any prompt', 'dm-todo');

      expect(summary.text).toContain('Summary');
      expect(todo.text).toContain('TODO');
      expect(summary.text).not.toEqual(todo.text);
    });

    it('is deterministic across calls for the same kind', async () => {
      const a = await generateAiText('prompt A', 'summary');
      const b = await generateAiText('prompt B', 'summary');
      expect(a.text).toEqual(b.text);
    });
  });
});
