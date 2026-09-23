import Link from 'next/link';
import { MonitorX } from 'lucide-react';

/** Decision 4: a hard block with a way forward, never a degraded recorder. */
export function UnsupportedBrowser({ reasons }: { reasons: string[] }) {
  return (
    <div
      data-testid="unsupported-browser"
      className="rounded-ss-xl border border-amber-300 bg-amber-50 p-6"
    >
      <div className="flex items-start gap-4">
        <MonitorX className="h-6 w-6 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900 font-display">
            Live recording isn’t supported in this browser
          </h2>
          {reasons.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
              {reasons.map(reason => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-slate-700">
            Use Chrome, Edge or Firefox on a laptop — or record with another app and upload the file.
          </p>
          <Link
            href="/sessions/upload"
            className="mt-4 inline-flex items-center rounded-ss-lg border border-ink-950 bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-950"
          >
            Upload a recording instead
          </Link>
        </div>
      </div>
    </div>
  );
}
