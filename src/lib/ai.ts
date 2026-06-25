import { openai } from '@ai-sdk/openai';
import { generateText, experimental_transcribe as transcribe } from 'ai';

/**
 * Centralized access to the OpenAI-backed AI services (Whisper transcription,
 * GPT-4o text generation).
 *
 * When `MOCK_AI_SERVICES=true` every call returns a deterministic fixture
 * instead of hitting OpenAI. This lets PR-stage integration tests exercise the
 * full transcription -> summary pipeline without spending API credits or
 * needing a real `OPENAI_API_KEY`.
 */
export function isAiMocked(): boolean {
  return process.env.MOCK_AI_SERVICES === 'true';
}

export type AiTextKind = 'summary' | 'dm-todo';

const MOCK_TRANSCRIPT =
  'The party entered the ruined keep at dusk. Thalia rolled a natural twenty on her ' +
  'perception check and spotted a hidden trapdoor beneath the rubble. After a short rest ' +
  'they descended into the crypt below, where Bren disarmed a glyph of warding and the ' +
  'group recovered the Sunstone Amulet.';

const MOCK_TEXT: Record<AiTextKind, string> = {
  summary:
    '# Session Summary\n\n' +
    'The party explored the ruined keep and uncovered a hidden crypt. ' +
    'Thalia led the way after spotting a concealed trapdoor, and Bren safely ' +
    'disarmed a magical glyph. The session ended with the recovery of the ' +
    'Sunstone Amulet.\n\n' +
    '## Key Events\n- Discovery of the hidden crypt\n- Recovery of the Sunstone Amulet',
  'dm-todo':
    '# DM TODO List\n\n' +
    '## Top Priorities\n' +
    '- [ ] Decide what the Sunstone Amulet does mechanically\n' +
    '- [ ] Prepare the crypt guardian for next session\n' +
    '- [ ] Follow up on the glyph of warding\'s origin',
};

/**
 * Transcribe an audio chunk via Whisper. Returns the transcript text.
 */
export async function transcribeAudio(audio: Buffer): Promise<{ text: string }> {
  if (isAiMocked()) {
    return { text: MOCK_TRANSCRIPT };
  }

  const result = await transcribe({
    model: openai.transcription('whisper-1'),
    audio,
  });
  return { text: result.text };
}

/**
 * Model per text kind: the narrative summary stays on full GPT-4o; the DM
 * TODO checklist re-sends the same full transcript, so the mini model cuts
 * that call's cost ~90% with negligible quality risk for a task list.
 */
const TEXT_MODEL: Record<AiTextKind, string> = {
  summary: 'gpt-4o',
  'dm-todo': 'gpt-4o-mini',
};

/**
 * Generate narrative text (session summary or DM TODO list).
 * `kind` selects the model and the deterministic output in mock mode.
 */
export async function generateAiText(prompt: string, kind: AiTextKind): Promise<{ text: string }> {
  if (isAiMocked()) {
    return { text: MOCK_TEXT[kind] };
  }

  const result = await generateText({
    model: openai(TEXT_MODEL[kind]),
    prompt,
  });
  return { text: result.text };
}
