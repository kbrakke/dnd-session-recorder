import type { UploadHealth } from './types';

/** H:MM:SS from milliseconds (truncated to whole seconds). */
export function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type SafetyTone = 'ok' | 'warn' | 'error';

/**
 * The HUD's safety indicator — the line that lets a DM trust the app with
 * an irreplaceable evening. Pure so the copy is unit-tested.
 */
export function safetyState(input: {
  savedThroughMs: number;
  health: UploadHealth;
  pendingParts: number;
  storageError: boolean;
}): { tone: SafetyTone; text: string } {
  const through = formatHms(input.savedThroughMs);
  const waiting = `${input.pendingParts} part${input.pendingParts === 1 ? '' : 's'} waiting`;

  if (input.storageError) {
    return {
      tone: 'error',
      text: `Not saving locally — keep this tab online. Saved through ${through}`,
    };
  }
  switch (input.health) {
    case 'offline':
      return {
        tone: 'warn',
        text: `Offline — buffering locally (${waiting}). Saved through ${through}`,
      };
    case 'auth-expired':
      return {
        tone: 'warn',
        text: `Signed out — sign in in another tab to keep uploading. Audio is safe locally; saved through ${through}`,
      };
    case 'degraded':
      return {
        tone: 'warn',
        text: `Buffering locally — reconnecting… Saved through ${through}`,
      };
    case 'ok':
    default:
      return input.pendingParts === 0
        ? { tone: 'ok', text: `All audio saved through ${through}` }
        : { tone: 'ok', text: `Uploading… saved through ${through}` };
  }
}
