'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, OctagonAlert, Radio } from 'lucide-react';
import Button from '@/components/ui/Button';
import { PreflightPanel } from '@/components/recording/preflight-panel';
import { UnsupportedBrowser } from '@/components/recording/unsupported-browser';
import { usePreflight } from '@/components/recording/use-preflight';
import { useRecorderEngine } from '@/components/recording/use-recorder-engine';
import { createRecorderApi, isRecorderApiError } from '@/lib/recording/api';
import { evictRecorderEngine } from '@/lib/recording/engine-registry';
import { RECORDING_MIME_TYPE } from '@/lib/recording/constants';
import { RecordingHud } from './components/recording-hud';
import { AssemblingState } from './components/assembling-state';
import { RecoveryPanel } from './components/recovery-panel';

const Spinner = () => (
  <div className="flex justify-center py-24">
    <Loader2 className="h-8 w-8 animate-spin text-ink-900" />
  </div>
);

/**
 * /sessions/[id]/record — the recorder HUD. Attaches to the session's engine
 * (still live if the user navigated here from /sessions/record or came back
 * via the Navbar indicator) or bootstraps it: fresh pre-flight, crash-tail
 * drain + recovery card, assembly polling, or a redirect.
 *
 * All state comes from the engine. There is deliberately NO React Query on
 * GET /api/recordings/[id] here: a focus/reconnect refetch would show the
 * server's stale 'interrupted' on the very tab that is recording.
 */
function RecordSessionContent() {
  const params = useParams();
  const sessionId = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: authSession, status } = useSession();
  const { engine, snapshot } = useRecorderEngine(sessionId);
  const api = useMemo(() => createRecorderApi(), []);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  // Read-only decision (memoized in the engine; StrictMode-safe).
  const userId = authSession?.user?.id;
  useEffect(() => {
    if (engine && userId) void engine.bootstrap(userId);
  }, [engine, userId]);

  useEffect(() => {
    if (!snapshot.redirectTo) return;
    queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['progress', sessionId] });
    router.replace(snapshot.redirectTo);
    if (['finalized', 'discarded'].includes(snapshot.phase) || snapshot.phase === 'idle') {
      evictRecorderEngine(sessionId);
    }
  }, [snapshot.redirectTo, snapshot.phase, sessionId, router, queryClient]);

  const fresh = snapshot.phase === 'idle' && snapshot.bootstrapped && !snapshot.redirectTo && !snapshot.recordingId;
  const resuming = snapshot.phase === 'preflight';
  const preflight = usePreflight(status === 'authenticated' && (fresh || resuming));

  async function onStartFresh() {
    if (!engine || !userId || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const resp = await api.startOrTakeover(sessionId, RECORDING_MIME_TYPE);
      const handoff = preflight.detachStream();
      if (!handoff) throw new Error('The microphone was released — try again.');
      await engine.start({
        stream: handoff.stream,
        deviceId: handoff.deviceId,
        userId,
        recordingId: resp.recording.id,
        recorderToken: resp.recorderToken,
        nextSegmentIndex: resp.nextSegmentIndex,
        mimeType: RECORDING_MIME_TYPE,
      });
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    } catch (error) {
      if (isRecorderApiError(error) && error.kind === 'has-audio') {
        router.replace(`/sessions/${sessionId}`);
        return;
      }
      setStartError(
        isRecorderApiError(error) && error.kind === 'rate-limited'
          ? `Too many attempts — please wait ${Math.ceil((error.retryAfterMs ?? 60_000) / 1000)} s and try again.`
          : error instanceof Error
            ? error.message
            : 'Could not start recording.'
      );
    } finally {
      setStarting(false);
    }
  }

  async function onResume() {
    if (!engine || !userId) return;
    const handoff = preflight.detachStream();
    if (!handoff) return;
    // The engine takes over first (one POST per click), then starts.
    await engine.start({ stream: handoff.stream, deviceId: handoff.deviceId, userId });
  }

  if (status !== 'authenticated' || !engine) return <Spinner />;

  let content: React.ReactNode;
  switch (snapshot.phase) {
    case 'idle':
      content = fresh ? (
        <PreflightPanel
          preflight={preflight}
          primaryLabel={starting ? 'Starting…' : 'Start recording'}
          onPrimary={onStartFresh}
          busy={starting}
          startError={startError}
        />
      ) : (
        <Spinner />
      );
      break;
    case 'preflight':
      content = (
        <PreflightPanel
          preflight={preflight}
          primaryLabel={snapshot.recovery?.mode === 'live-elsewhere' ? 'Take over and record' : 'Resume recording'}
          onPrimary={() => void onResume()}
        />
      );
      break;
    case 'unsupported':
      content = <UnsupportedBrowser reasons={snapshot.errorMessage ? [snapshot.errorMessage] : []} />;
      break;
    case 'starting':
    case 'recording':
    case 'paused':
      content = <RecordingHud engine={engine} snapshot={snapshot} />;
      break;
    case 'stopping':
    case 'uploading-tail':
    case 'tail-blocked':
    case 'finalizing':
    case 'finalized':
      content = <AssemblingState engine={engine} snapshot={snapshot} />;
      break;
    case 'finalize-failed':
    case 'recovering':
    case 'recovery-choice':
    case 'discarding':
      content = <RecoveryPanel engine={engine} snapshot={snapshot} sessionId={sessionId} />;
      break;
    case 'discarded':
      content = <Spinner />;
      break;
    case 'taken-over':
      content = (
        <div data-testid="taken-over" className="rounded-ss-xl border border-slate-300 bg-white p-6 shadow-ss-card space-y-3">
          <p className="flex items-center gap-2 text-lg font-semibold text-slate-900 font-display">
            <Radio className="h-5 w-5 text-ink-900" /> Recording stopped in this tab
          </p>
          <p className="text-sm text-slate-700">{snapshot.takenOverMessage}</p>
          <Link href={`/sessions/${sessionId}`} className="inline-block text-sm font-semibold text-ink-900 underline">
            Go to the session
          </Link>
        </div>
      );
      break;
    case 'error':
    default:
      content = (
        <div role="alert" data-testid="recorder-error" className="rounded-ss-xl border border-red-300 bg-red-50 p-6 space-y-3">
          <p className="flex items-center gap-2 text-lg font-semibold text-red-900 font-display">
            <OctagonAlert className="h-5 w-5" /> Something went wrong
          </p>
          <p className="text-sm text-red-800">{snapshot.errorMessage ?? 'The recorder hit an unexpected error.'}</p>
          <p className="text-sm text-red-800">Everything already uploaded is safe.</p>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href={`/sessions/${sessionId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" /> Session
      </Link>
      <h1 className="text-3xl font-bold text-slate-900 font-display">Live recording</h1>
      {content}
    </div>
  );
}

export default function RecordSessionPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RecordSessionContent />
    </Suspense>
  );
}
