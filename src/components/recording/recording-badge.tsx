import { AlertTriangle, Loader2, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecordingDisplayStatus } from '@/lib/recording/types';

const CONFIG: Record<
  Exclude<RecordingDisplayStatus, 'finalized'>,
  { label: string; className: string }
> = {
  recording: { label: 'Recording', className: 'bg-red-50 text-red-800 border-red-300' },
  paused: { label: 'Paused', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  interrupted: { label: 'Interrupted', className: 'bg-amber-50 text-amber-800 border-amber-300' },
  finalizing: { label: 'Assembling', className: 'bg-ink-50 text-ink-900 border-ink-300' },
  failed: { label: 'Assembly failed', className: 'bg-red-50 text-red-800 border-red-300' },
};

/** List/dashboard badge derived from the session's recording (not its status). */
export function RecordingBadge({ status, className }: { status: RecordingDisplayStatus; className?: string }) {
  if (status === 'finalized') return null;
  const config = CONFIG[status];
  return (
    <span
      data-testid="recording-badge"
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-ss-md border font-bold text-[10px] tracking-[0.12em] uppercase leading-tight',
        config.className,
        className
      )}
    >
      {status === 'recording' && <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />}
      {status === 'paused' && <Pause size={10} strokeWidth={3} />}
      {(status === 'interrupted' || status === 'failed') && <AlertTriangle size={10} strokeWidth={3} />}
      {status === 'finalizing' && <Loader2 size={10} strokeWidth={3} className="animate-spin" />}
      {config.label}
    </span>
  );
}
