'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useRef } from 'react';
import { Loader2, ArrowLeft, FileText, Sparkles, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { SessionHeader } from './components/session-header';
import { SessionSidebar } from './components/session-sidebar';
import { ProcessingPipeline } from './components/processing-pipeline';
import { ErrorBanner } from './components/error-banner';
import { UploadSection } from './components/upload-section';
import { AudioPlayer } from './components/audio-player';
import { SummarySection } from './components/summary-section';
import { TranscriptSection } from './components/transcript-section';
import { DMTodoPanel } from './components/dm-todo-panel';
import { DeleteSessionModal } from './components/delete-session-modal';
import { ThemeSelector } from './components/theme-selector';
import { useSessionData } from './hooks/use-session-data';
import { useSessionMutations } from './hooks/use-session-mutations';
import { useSessionTheme } from './hooks/use-session-theme';
import type { SessionToDelete } from './types';

type TabKey = 'summary' | 'transcript' | 'todos';

const TABS: { key: TabKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'summary', label: 'Summary', icon: Sparkles },
  { key: 'transcript', label: 'Transcript', icon: FileText },
  { key: 'todos', label: 'DM Tasks', icon: CheckCircle },
];

function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialState = searchParams.get('initialState');
  const isInitialProcessing = initialState === 'processing';
  const hasReceivedFirstData = useRef(false);

  const {
    session,
    campaign,
    campaignSessions,
    summary,
    dmTodoList,
    transcriptions,
    isLoading,
  } = useSessionData({ sessionId });

  const {
    startProcessingMutation,
    cancelTranscriptionMutation,
    updateSummaryMutation,
    updateTodoMutation,
    generateSummaryMutation,
    generateTodoMutation,
    deleteSessionMutation,
  } = useSessionMutations({ sessionId });

  const { theme: currentTheme, setTheme } = useSessionTheme();

  // Local UI state
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [railOpen, setRailOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<{
    showModal: boolean;
    session: SessionToDelete | null;
  }>({
    showModal: false,
    session: null,
  });

  // Track first data reception for optimistic loading
  if (session && !hasReceivedFirstData.current) {
    hasReceivedFirstData.current = true;
  }

  const showOptimisticProcessing = isInitialProcessing && !hasReceivedFirstData.current;

  // Loading state
  if (isLoading || !session) {
    if (showOptimisticProcessing) {
      return (
        <div
          className="flex flex-col min-h-[calc(100vh-80px)]"
          style={{ background: 'var(--sp-bg-base)' }}
        >
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2
                className="w-10 h-10 animate-spin mx-auto mb-4"
                style={{ color: 'var(--sp-primary)' }}
              />
              <p
                className="text-sm font-body"
                style={{ color: 'var(--sp-fg-3)' }}
              >
                Starting processing...
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className="flex items-center justify-center min-h-[calc(100vh-80px)]"
        style={{ background: 'var(--sp-bg-base)' }}
      >
        <Loader2
          className="w-12 h-12 animate-spin"
          style={{ color: 'var(--sp-primary)' }}
        />
      </div>
    );
  }

  const needsAudio = !session.uploadId && transcriptions.length === 0;

  const handleDeleteSession = (sessionToDelete: SessionToDelete) => {
    setDeleteState({ showModal: true, session: sessionToDelete });
  };

  const handlePickSession = (id: string) => {
    router.push(`/sessions/${id}`);
  };

  return (
    <div
      className="flex flex-col min-h-[calc(100vh-80px)]"
      style={{ background: 'var(--sp-bg-base)' }}
    >
      {/* Processing Pipeline Strip */}
      <ProcessingPipeline
        session={session}
        transcriptions={transcriptions}
        summary={summary}
        dmTodoList={dmTodoList}
        isInitialProcessing={isInitialProcessing}
        onStartProcessing={() => startProcessingMutation.mutate()}
        onCancelTranscription={() => cancelTranscriptionMutation.mutate()}
      />

      {/* Upload Section */}
      {needsAudio && <UploadSection sessionId={sessionId} />}

      {/* Error Banner */}
      {session.status === 'error' && session.errorMessage && (
        <ErrorBanner
          error={session.errorMessage}
          errorStep={session.errorStep || undefined}
          onRetry={() => startProcessingMutation.mutate()}
          isRetrying={startProcessingMutation.isPending}
        />
      )}

      {/* Main layout: rail + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Collapsible sessions rail */}
        <SessionSidebar
          open={railOpen}
          onToggle={() => setRailOpen(!railOpen)}
          campaign={campaign}
          sessions={campaignSessions}
          activeSessionId={sessionId}
          onPickSession={handlePickSession}
        />

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 pb-12">
            {/* Back link + theme selector row */}
            <div className="flex items-center justify-between pt-5 pb-2">
              <Link
                href="/sessions"
                className="inline-flex items-center gap-1.5 text-sm font-body font-medium hover:opacity-70 transition-opacity"
                style={{ color: 'var(--sp-fg-3)' }}
              >
                <ArrowLeft className="w-4 h-4" />
                Sessions
              </Link>
              <ThemeSelector currentTheme={currentTheme} onChange={setTheme} />
            </div>

            {/* Session header */}
            <SessionHeader
              session={session}
              onDelete={() =>
                handleDeleteSession({
                  id: session.id,
                  title: session.title,
                  campaignId: session.campaign.id,
                })
              }
              transcriptionCount={transcriptions.length}
            />

            {/* Session audio playback */}
            {session.uploadId && (
              <AudioPlayer uploadId={session.uploadId} duration={session.duration} />
            )}

            {/* Tab bar */}
            <div
              className="flex items-center gap-0 border-b"
              style={{ borderColor: 'var(--sp-border)' }}
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="relative inline-flex items-center gap-2 px-4 py-3 text-sm font-body font-medium transition-colors"
                    style={{
                      color: isActive ? 'var(--sp-primary)' : 'var(--sp-fg-3)',
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {/* Active indicator */}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-0 right-0 h-[2px]"
                        style={{ background: 'var(--sp-primary)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div style={{ animation: 'ss-fade 200ms ease' }}>
              {activeTab === 'summary' && (
                <SummarySection
                  summary={summary}
                  sessionStatus={session.status}
                  onSave={(text) => updateSummaryMutation.mutate(text)}
                  onRegenerate={() => generateSummaryMutation.mutate()}
                  isSaving={updateSummaryMutation.isPending}
                  isRegenerating={generateSummaryMutation.isPending}
                  hasTranscriptions={transcriptions.length > 0}
                />
              )}

              {activeTab === 'transcript' && (
                <TranscriptSection
                  transcriptions={transcriptions}
                  sessionStatus={session.status}
                />
              )}

              {activeTab === 'todos' && (
                <DMTodoPanel
                  todoList={dmTodoList}
                  sessionStatus={session.status}
                  onSave={(text) => updateTodoMutation.mutate(text)}
                  onRegenerate={() => generateTodoMutation.mutate()}
                  isSaving={updateTodoMutation.isPending}
                  isRegenerating={generateTodoMutation.isPending}
                  hasTranscriptions={transcriptions.length > 0}
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteSessionModal
        isOpen={deleteState.showModal}
        session={deleteState.session}
        onConfirm={() => {
          if (deleteState.session) {
            deleteSessionMutation.mutate(deleteState.session);
          }
        }}
        onCancel={() => setDeleteState({ showModal: false, session: null })}
        isDeleting={deleteSessionMutation.isPending}
      />
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center min-h-[calc(100vh-80px)]"
          style={{ background: 'var(--sp-bg-base)' }}
        >
          <Loader2
            className="w-12 h-12 animate-spin"
            style={{ color: 'var(--sp-primary, #1e3a8a)' }}
          />
        </div>
      }
    >
      <SessionDetailPage />
    </Suspense>
  );
}
