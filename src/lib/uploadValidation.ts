/** Audio MIME types accepted for upload (shared across every upload route). */
export const allowedMimeTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/x-aac',
  'audio/flac',
  'audio/webm',
];

/**
 * Whether an uploaded file's reported MIME type is an accepted audio type.
 *
 * Browsers' MediaRecorder (and some upload widgets) tag the type with
 * parameters, e.g. "audio/webm;codecs=opus" or "audio/mp4; codecs=mp4a.40.2".
 * A naive `allowedMimeTypes.includes(type)` rejects those valid recordings, so
 * we compare on the base type only (case/whitespace normalized).
 */
export function isAllowedMime(mimetype: string): boolean {
  // Reject control characters (e.g. newlines) so a base-type match can't be
  // smuggled past via header-injection-style input.
  if (/[\u0000-\u001f\u007f]/.test(mimetype)) {
    return false;
  }
  const baseType = mimetype.split(';')[0].trim().toLowerCase();
  return allowedMimeTypes.includes(baseType);
}
