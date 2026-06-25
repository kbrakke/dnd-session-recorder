/**
 * Session status vocabulary shared by the UI.
 *
 * The backend writes exactly these statuses (see prisma/schema.prisma):
 *   draft -> uploaded -> transcribing -> transcribed -> summarizing -> completed
 * with 'error' reachable from any processing step.
 */
export const SESSION_STATUSES = [
  'draft',
  'uploaded',
  'transcribing',
  'transcribed',
  'summarizing',
  'completed',
  'error',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Statuses where the pipeline is queued or actively working. */
export const IN_FLIGHT_STATUSES: readonly string[] = [
  'uploaded',
  'transcribing',
  'transcribed',
  'summarizing',
];

export function isInFlight(status: string): boolean {
  return IN_FLIGHT_STATUSES.includes(status);
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  uploaded: 'Queued',
  transcribing: 'Transcribing',
  transcribed: 'Transcribed',
  summarizing: 'Summarizing',
  completed: 'Completed',
  error: 'Error',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
