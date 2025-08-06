'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, BookOpen, ArrowLeft, AlertCircle, Sparkles, Download, Copy, Edit3, Lock, Unlock, RefreshCw, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useState } from 'react';

interface Session {
  id: number;
  title: string;
  sessionDate: string;
  duration: number | null;
  createdAt: string;
  status: string;
  campaign: {
    name: string;
  };
  _count: {
    transcriptions: number;
  };
}

interface Summary {
  id: number;
  summaryText: string;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
  originalText: string | null;
}

interface Transcription {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

export default function SessionSummaryPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const queryClient = useQueryClient();

  const [copied, setCopied] = useState(false);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummaryText, setEditedSummaryText] = useState('');
  const [processingStep, setProcessingStep] = useState<'summarize' | 'complete' | null>(null);

  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      return response.json();
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<Summary>({
    queryKey: ['summary', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/summary/${sessionId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch summary');
      }
      return response.json();
    },
    enabled: !!sessionId,
  });

  const { data: transcriptions } = useQuery<Transcription[]>({
    queryKey: ['transcriptions', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/transcription/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch transcriptions');
      return response.json();
    },
    enabled: !!sessionId,
  });

  // Summary mutation
  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/summary/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Summary generation failed');
      }

      return response.json();
    },
  });

  // Update summary mutation
  const updateSummaryMutation = useMutation({
    mutationFn: async (summaryText: string) => {
      const response = await fetch(`/api/summary/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary_text: summaryText }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Summary update failed');
      }

      return response.json();
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const exportSummary = () => {
    if (!summary || !session) return;

    let content = `${session.title} - AI Summary\n`;
    content += `Campaign: ${session.campaign.name}\n`;
    content += `Date: ${formatDate(session.sessionDate)}\n`;
    content += `Duration: ${formatDuration(session.duration)}\n`;
    content += `Summary Generated: ${formatDate(summary.createdAt)}\n\n`;
    content += '--- AI GENERATED SUMMARY ---\n\n';
    content += summary.summaryText;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_summary.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copySummary = async () => {
    if (!summary) return;

    try {
      await navigator.clipboard.writeText(summary.summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Handle summary regeneration
  const handleRegenerateSummary = async () => {
    if (!session) return;

    try {
      setProcessingStep('summarize');
      await summarizeMutation.mutateAsync();
      setProcessingStep('complete');

      // Reset processing step after a delay to show completion
      setTimeout(() => {
        setProcessingStep(null);
      }, 2000);

      // Refresh summary data
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });

    } catch (error) {
      console.error('Summary regeneration error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setProcessingStep(null);
    }
  };

  // Handle summary editing
  const handleEditSummary = () => {
    if (!summary) return;
    setEditedSummaryText(summary.summaryText);
    setIsEditingSummary(true);
  };

  const handleSaveSummary = async () => {
    if (!editedSummaryText.trim()) {
      alert('Summary cannot be empty');
      return;
    }

    try {
      await updateSummaryMutation.mutateAsync(editedSummaryText);
      setIsEditingSummary(false);
      setEditedSummaryText('');

      // Refresh summary data
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });

    } catch (error) {
      console.error('Summary update error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancelSummaryEdit = () => {
    setIsEditingSummary(false);
    setEditedSummaryText('');
  };

  if (sessionLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-500 mt-2">Loading session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Session not found</h3>
        <p className="text-gray-500 mb-6">The session you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/sessions">
          <Button>Back to Sessions</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/sessions/${sessionId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Session
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{session.title}</h1>
            <p className="text-gray-600">AI Generated Summary</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">

        </div>
      </div>

      {/* Processing Status */}
      {processingStep && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Regenerating Summary</h3>
          <div className="space-y-4">
            {[
              { key: 'summarize', label: 'Creating AI summary', icon: Sparkles },
              { key: 'complete', label: 'Summary regenerated!', icon: CheckCircle },
            ].map((step) => {
              const Icon = step.icon;
              const isActive = step.key === processingStep;
              const isCompleted = processingStep === 'complete' && step.key === 'summarize';

              return (
                <div key={step.key} className={`flex items-center space-x-3 p-3 rounded-lg ${isActive ? 'bg-blue-50 border border-blue-200' :
                  isCompleted ? 'bg-green-50 border border-green-200' :
                    'bg-gray-50 border border-gray-200'
                  }`}>
                  <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' :
                    isCompleted ? 'text-green-600' :
                      'text-gray-400'
                    }`} />
                  <span className={`font-medium ${isActive ? 'text-blue-900' :
                    isCompleted ? 'text-green-900' :
                      'text-gray-500'
                    }`}>
                    {step.label}
                  </span>
                  {isActive && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 ml-auto"></div>
                  )}
                  {isCompleted && (
                    <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Campaign</p>
              <p className="text-lg font-semibold text-gray-900">{session.campaign.name}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Session Date</p>
              <p className="text-lg font-semibold text-gray-900">{formatDate(session.sessionDate)}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Duration</p>
              <p className="text-lg font-semibold text-gray-900">{formatDuration(session.duration)}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Generated</p>
              <p className="text-lg font-semibold text-gray-900">
                {summary ? formatDate(summary.createdAt) : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Sparkles className="h-6 w-6 text-purple-600" />
              <h2 className="text-xl font-semibold text-gray-900">AI Generated Summary</h2>
            </div>
            <div className="flex items-center space-x-2">
              {/* Summary Management Actions */}
              {transcriptions && transcriptions.length > 0 && !processingStep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateSummary}
                  disabled={summarizeMutation.isPending}
                  className="flex items-center space-x-2"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>{summarizeMutation.isPending ? 'Generating...' : 'Regenerate'}</span>
                </Button>
              )}
              {summary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isEditingSummary ? handleCancelSummaryEdit : handleEditSummary}
                  className="flex items-center space-x-2"
                >
                  {isEditingSummary ? (
                    <>
                      <Unlock className="h-3 w-3" />
                      <span>Cancel Edit</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="h-3 w-3" />
                      <span>Edit</span>
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={copySummary}
                disabled={!summary}
                className="flex items-center space-x-2"
              >
                <Copy className="h-4 w-4" />
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </Button>
              <Button
                variant="outline"
                onClick={exportSummary}
                disabled={!summary}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Export</span>
              </Button>
            </div>
          </div>
          {summary && (
            <p className="text-gray-600 mt-1">
              Generated on {formatDate(summary.createdAt)} using GPT-4
              {summary.isEdited && summary.editedAt && (
                <span className="text-amber-600 ml-2">
                  (edited {formatDate(summary.editedAt)})
                </span>
              )}
            </p>
          )}
        </div>

        <div className="p-8">
          {summaryLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading summary...</p>
            </div>
          ) : !summary ? (
            <div className="text-center py-12">
              <Sparkles className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No summary available</h3>
              <p className="text-gray-500 mb-6">
                This session does not have an AI-generated summary yet.
              </p>
              {transcriptions && transcriptions.length > 0 && !processingStep && (
                <Button
                  onClick={handleRegenerateSummary}
                  disabled={summarizeMutation.isPending}
                  className="mr-4 flex items-center space-x-2"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{summarizeMutation.isPending ? 'Generating...' : 'Generate Summary'}</span>
                </Button>
              )}
              <Link href={`/sessions/${sessionId}`}>
                <Button variant="outline">Back to Session Details</Button>
              </Link>
            </div>
          ) : (
            <div className="prose prose-lg max-w-none">
              {isEditingSummary ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <Lock className="h-5 w-5 text-amber-600" />
                      <span className="text-sm text-amber-800 font-medium">
                        Summary Editing Mode
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      Make your changes and save, or cancel to revert.
                    </p>
                  </div>
                  <textarea
                    value={editedSummaryText}
                    onChange={(e) => setEditedSummaryText(e.target.value)}
                    className="w-full h-96 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder="Enter your summary..."
                  />
                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="outline"
                      onClick={handleCancelSummaryEdit}
                      disabled={updateSummaryMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveSummary}
                      disabled={updateSummaryMutation.isPending || !editedSummaryText.trim()}
                      className="flex items-center space-x-2"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>{updateSummaryMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-6 border border-purple-200">
                    <div className="text-gray-800 leading-relaxed whitespace-pre-wrap text-base">
                      {summary.summaryText}
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center space-x-4">
                        <span>Generated by GPT-4</span>
                        <span>•</span>
                        <span>{summary.summaryText.split(' ').length} words</span>
                        <span>•</span>
                        <span>Based on {session._count?.transcriptions || 0} transcript segments</span>
                      </div>
                      <div>
                        {formatDate(summary.createdAt)}
                        {summary.isEdited && summary.editedAt && (
                          <span className="text-amber-600 ml-2">
                            (edited {formatDate(summary.editedAt)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}