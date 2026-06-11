import { cn } from '@/lib/utils';
import { Check, Clock } from 'lucide-react';
import { isInFlight, statusLabel } from '@/lib/session-status';

type Visual = 'completed' | 'processing' | 'draft' | 'error';

const visualConfig: Record<Visual, { bg: string; fg: string; border: string }> = {
  completed: { bg: 'bg-emerald-800', fg: 'text-emerald-50', border: 'border-emerald-700' },
  processing: { bg: 'bg-ink-900', fg: 'text-ink-50', border: 'border-ink-800' },
  draft: { bg: 'bg-yellow-800', fg: 'text-yellow-100', border: 'border-yellow-700' },
  error: { bg: 'bg-red-900', fg: 'text-red-100', border: 'border-red-800' },
};

function visualFor(status: string): Visual {
  if (status === 'completed') return 'completed';
  if (status === 'error') return 'error';
  if (isInFlight(status)) return 'processing';
  return 'draft';
}

function StatusIcon({ visual }: { visual: Visual }) {
  switch (visual) {
    case 'completed':
      return <Check size={10} strokeWidth={3.5} />;
    case 'processing':
      return (
        <span className="inline-block w-2 h-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
      );
    case 'draft':
      return <Clock size={10} strokeWidth={2.5} />;
    case 'error':
      return <span className="text-[11px] font-extrabold leading-none">!</span>;
  }
}

export default function StatusPill({ status, className }: { status: string; className?: string }) {
  const visual = visualFor(status);
  const config = visualConfig[visual];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-ss-md border font-bold text-[10px] tracking-[0.12em] uppercase leading-tight',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]',
        config.bg,
        config.fg,
        config.border,
        className,
      )}
    >
      <StatusIcon visual={visual} />
      {statusLabel(status)}
    </span>
  );
}
