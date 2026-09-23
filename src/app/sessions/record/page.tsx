'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Calendar, Loader2, Plus, Upload } from 'lucide-react';
import Button from '@/components/ui/Button';
import { TextInput } from '@/components/forms';
import { PreflightPanel } from '@/components/recording/preflight-panel';
import { usePreflight } from '@/components/recording/use-preflight';
import { useBeforeUnloadGuard } from '@/components/recording/use-before-unload';
import { createRecorderApi, isRecorderApiError } from '@/lib/recording/api';
import { getRecorderEngine } from '@/lib/recording/engine-registry';
import { RECORDING_MIME_TYPE } from '@/lib/recording/constants';

interface Campaign {
  id: string;
  name: string;
}

function startErrorMessage(error: unknown): string {
  if (isRecorderApiError(error)) {
    if (error.kind === 'rate-limited') {
      const seconds = Math.ceil((error.retryAfterMs ?? 60_000) / 1000);
      return `Too many attempts — please wait ${seconds} s and try again.`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Could not start recording.';
}

/**
 * /sessions/record — "Record live" entry point: session details and the
 * microphone pre-flight on one screen. Start creates the draft session (plain
 * route first), then the recording (rate-limited route last), hands the live
 * pre-flight stream to the recorder engine — capture begins BEFORE
 * navigation — and moves to the recorder HUD.
 */
function RecordNewSessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: authSession, status } = useSession();
  const api = useMemo(() => createRecorderApi(), []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  const [title, setTitle] = useState('');
  const [campaignId, setCampaignId] = useState(searchParams.get('campaignId') ?? '');
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // A retry after a failed POST /recording must not create a second session.
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);

  const preflight = usePreflight(status === 'authenticated');
  useBeforeUnloadGuard(starting ? 'starting' : 'idle');

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    enabled: status === 'authenticated',
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  // Preselect the only campaign, or honor ?campaignId once campaigns load.
  useEffect(() => {
    if (campaignId || campaigns.length !== 1) return;
    setCampaignId(campaigns[0].id);
  }, [campaigns, campaignId]);

  const createCampaign = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create campaign');
      }
      return (await response.json()) as Campaign;
    },
    onSuccess: campaign => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setCampaignId(campaign.id);
      setShowNewCampaign(false);
      setNewCampaignName('');
    },
  });

  const canStart = !!title.trim() && !!campaignId && !!sessionDate && preflight.status === 'ready';

  async function onStart() {
    if (starting || !canStart || !authSession?.user?.id) return;
    setStarting(true);
    setStartError(null);
    try {
      let sessionId = draftSessionId;
      if (!sessionId) {
        const created = await api.createDraftSession({
          title: title.trim(),
          campaignId,
          sessionDate: new Date(sessionDate).toISOString(),
        });
        sessionId = created.id;
        setDraftSessionId(sessionId);
      }

      const resp = await api.startOrTakeover(sessionId, RECORDING_MIME_TYPE);
      const handoff = preflight.detachStream();
      if (!handoff) throw new Error('The microphone was released — try again.');

      await getRecorderEngine(sessionId).start({
        stream: handoff.stream,
        deviceId: handoff.deviceId,
        userId: authSession.user.id,
        recordingId: resp.recording.id,
        recorderToken: resp.recorderToken,
        nextSegmentIndex: resp.nextSegmentIndex,
        mimeType: RECORDING_MIME_TYPE,
      });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      router.push(`/sessions/${sessionId}/record`);
    } catch (error) {
      setStartError(startErrorMessage(error));
      setStarting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-ink-900" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 font-display">Record a live session</h1>
          <p className="text-slate-600 mt-1">
            Audio uploads continuously while you play — nothing is lost if the tab closes.
          </p>
        </div>
        <Link
          // Object form: Next encodes the (user-controllable) query value.
          href={{ pathname: '/sessions/upload', query: campaignId ? { campaignId } : {} }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink-900"
        >
          <Upload className="h-4 w-4" /> Upload a file instead
        </Link>
      </div>

      <div className="bg-white rounded-ss-xl border border-slate-300 p-6 shadow-ss-card space-y-5">
        <h2 className="text-lg font-semibold text-slate-900 font-display">Session details</h2>

        <TextInput
          id="session-title"
          label="Session Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. The Siege of Emberhold"
          disabled={!!draftSessionId}
        />

        <div>
          <label htmlFor="session-campaign" className="block text-sm font-medium text-gray-700">
            Campaign
          </label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <BookOpen className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                id="session-campaign"
                value={campaignId}
                onChange={e => setCampaignId(e.target.value)}
                disabled={campaignsLoading || !!draftSessionId}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a campaign</option>
                {campaigns.map(campaign => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNewCampaign(v => !v)}
              disabled={!!draftSessionId}
            >
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
          {showNewCampaign && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={e => {
                e.preventDefault();
                if (newCampaignName.trim()) createCampaign.mutate(newCampaignName.trim());
              }}
            >
              <input
                aria-label="New campaign name"
                value={newCampaignName}
                onChange={e => setNewCampaignName(e.target.value)}
                placeholder="Campaign name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <Button type="submit" size="sm" disabled={createCampaign.isPending || !newCampaignName.trim()}>
                {createCampaign.isPending ? 'Creating…' : 'Create'}
              </Button>
            </form>
          )}
          {createCampaign.error && (
            <p className="mt-1 text-sm text-red-600">{(createCampaign.error as Error).message}</p>
          )}
        </div>

        <TextInput
          id="session-date"
          type="date"
          label="Session Date"
          value={sessionDate}
          onChange={e => setSessionDate(e.target.value)}
          icon={<Calendar className="h-4 w-4" />}
          disabled={!!draftSessionId}
        />
      </div>

      <PreflightPanel
        preflight={preflight}
        primaryLabel={starting ? 'Starting…' : 'Start recording'}
        onPrimary={onStart}
        primaryDisabled={!canStart}
        busy={starting}
        startError={startError}
      />
    </div>
  );
}

export default function RecordNewSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-ink-900" />
        </div>
      }
    >
      <RecordNewSessionContent />
    </Suspense>
  );
}
