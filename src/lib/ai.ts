import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

/**
 * Centralized access to the OpenAI-backed AI services (audio transcription,
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
 * gpt-transcribe is 25% cheaper than whisper-1 ($0.0045 vs $0.006/min) and
 * accepts context hints (prompt/keywords/languages) for future campaign-
 * vocabulary work. Set TRANSCRIBE_MODEL=whisper-1 to fall back.
 */
const DEFAULT_TRANSCRIBE_MODEL = 'gpt-transcribe';

/**
 * Transcribe an audio chunk. Returns the transcript text.
 *
 * Calls POST /v1/audio/transcriptions directly instead of going through
 * @ai-sdk/openai: the SDK (3.0.x) hardcodes response_format 'verbose_json'
 * for every model outside its gpt-4o-transcribe allowlist, and gpt-transcribe
 * only supports 'json'. The raw endpoint also exposes the keywords/languages
 * hints the SDK doesn't. `filename` matters: OpenAI infers the container
 * format from its extension, so pass the real chunk filename.
 */
export async function transcribeAudio(
  audio: Buffer,
  filename = 'audio.mp3'
): Promise<{ text: string }> {
  if (isAiMocked()) {
    return { text: MOCK_TRANSCRIPT };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const form = new FormData();
  form.append('model', process.env.TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL);
  form.append('file', new Blob([new Uint8Array(audio)]), filename);
  form.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Transcription request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  const result = (await response.json()) as { text?: string };
  return { text: result.text ?? '' };
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
