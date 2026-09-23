import { cn } from '@/lib/utils';

const BARS = 16;

/** Input level 0..1 as a bar meter; null renders an idle (unknown) meter. */
export function LevelMeter({ level, className }: { level: number | null; className?: string }) {
  const lit = level === null ? 0 : Math.round(Math.max(0, Math.min(1, level)) * BARS);
  return (
    <div
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={level === null ? undefined : Math.round(level * 100)}
      data-testid="level-meter"
      className={cn('flex items-end gap-[3px] h-8', className)}
    >
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'w-2 rounded-sm transition-colors duration-75',
            i < lit ? (i >= BARS - 3 ? 'bg-red-600' : i >= BARS - 6 ? 'bg-amber-500' : 'bg-emerald-600') : 'bg-slate-200'
          )}
          style={{ height: `${30 + (i / BARS) * 70}%` }}
        />
      ))}
    </div>
  );
}
