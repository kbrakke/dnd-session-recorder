'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  Calendar, Clock, BookOpen, FileText, Sparkles,
  ChevronDown, ChevronRight, Edit3, RefreshCw,
  CheckCircle, Save
} from 'lucide-react';
import { marked } from 'marked';

// Interfaces
interface Session {
  id: string;
  title: string;
  sessionDate: string;
  duration: number | null;
  status: string;
  campaign: {
    id: string;
    name: string;
  };
}

interface SessionDetail extends Session {
  createdAt: string;
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
}

interface DmTodoList {
  id: number;
  content: string;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
}

interface Transcription {
  id: number;
  text: string;
  startTime: number;
  endTime: number;
}

export default function SessionPageRedesign() {
  const params = useParams();
  const sessionId = params.id as string;
  const queryClient = useQueryClient();

  // State
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummaryText, setEditedSummaryText] = useState('');
  const [isEditingTodo, setIsEditingTodo] = useState(false);
  const [editedTodoText, setEditedTodoText] = useState('');

  // Data fetching
  const { data: session, isLoading: sessionLoading } = useQuery<SessionDetail>({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      return response.json();
    },
  });

  const { data: campaignSessions = [] } = useQuery<Session[]>({
    queryKey: ['campaign-sessions', session?.campaign.id],
    queryFn: async () => {
      const response = await fetch(`/api/sessions?campaignId=${session!.campaign.id}`);
      if (!response.ok) throw new Error('Failed to fetch campaign sessions');
      return response.json();
    },
    enabled: !!session?.campaign.id,
  });

  const { data: summary } = useQuery<Summary>({
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

  const { data: dmTodoList } = useQuery<DmTodoList>({
    queryKey: ['dmTodoList', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/dm-todo/${sessionId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch TODO list');
      }
      return response.json();
    },
    enabled: !!sessionId,
  });

  const { data: transcriptions = [] } = useQuery<Transcription[]>({
    queryKey: ['transcriptions', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}/transcriptions`);
      if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error('Failed to fetch transcriptions');
      }
      return response.json();
    },
    enabled: !!sessionId,
  });

  // Mutations
  const updateSummaryMutation = useMutation({
    mutationFn: async (summaryText: string) => {
      const response = await fetch(`/api/summary/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary_text: summaryText }),
      });
      if (!response.ok) throw new Error('Failed to update summary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });
      setIsEditingSummary(false);
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/dm-todo/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('Failed to update TODO');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dmTodoList', sessionId] });
      setIsEditingTodo(false);
    },
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/summary/${sessionId}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to generate summary');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });
    },
  });

  const generateTodoMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/dm-todo/${sessionId}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to generate TODO');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dmTodoList', sessionId] });
    },
  });

  // Handlers
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleEditSummary = () => {
    if (summary) {
      setEditedSummaryText(summary.summaryText);
      setIsEditingSummary(true);
    }
  };

  const handleSaveSummary = () => {
    updateSummaryMutation.mutate(editedSummaryText);
  };

  const handleEditTodo = () => {
    if (dmTodoList) {
      setEditedTodoText(dmTodoList.content);
      setIsEditingTodo(true);
    }
  };

  const handleSaveTodo = () => {
    updateTodoMutation.mutate(editedTodoText);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'Unknown';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      uploaded: 'bg-blue-100 text-blue-800',
      transcribing: 'bg-yellow-100 text-yellow-800',
      transcribed: 'bg-green-100 text-green-800',
      summarizing: 'bg-purple-100 text-purple-800',
      completed: 'bg-emerald-100 text-emerald-800',
      error: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (sessionLoading || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left Sidebar - Session Navigation */}
      <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Link
            href={`/campaigns/${session.campaign.id}`}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3"
          >
            <BookOpen className="h-4 w-4" />
            <span className="font-medium">{session.campaign.name}</span>
          </Link>
          <div className="text-xs text-gray-500">
            {campaignSessions.length} session{campaignSessions.length !== 1 ? 's' : ''} in campaign
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase px-2 mb-3">
            All Sessions
          </div>
          {campaignSessions.map((s) => (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className={`
                block px-4 rounded-lg mb-2 border-l-4 transition-all
                ${s.id === sessionId
                  ? 'py-4 bg-blue-50 border-l-blue-600 text-blue-900 shadow-sm'
                  : 'py-3 border-l-transparent hover:bg-gray-50 text-gray-700'
                }
              `}
            >
              <div className={`mb-2 ${s.id === sessionId ? 'text-base font-bold' : 'text-sm font-medium'}`}>
                {s.title}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(s.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                {s.duration && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(s.duration)}</span>
                  </div>
                )}
                <div className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(s.status)}`}>
                  {s.status}
                </div>
              </div>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-white">
        {/* Summary Card */}
        <div className="border-b border-gray-200">
          <div className="bg-white p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gray-100">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-900">AI Summary</h2>
              </div>
              <div className="flex gap-2">
                {summary && (
                  <>
                    {!isEditingSummary && (
                      <button
                        onClick={handleEditSummary}
                        className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => generateSummaryMutation.mutate()}
                      disabled={generateSummaryMutation.isPending}
                      className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${generateSummaryMutation.isPending ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                  </>
                )}
              </div>
            </div>

            {summary ? (
              isEditingSummary ? (
                <div className="space-y-4">
                  <textarea
                    value={editedSummaryText}
                    onChange={(e) => setEditedSummaryText(e.target.value)}
                    className="w-full h-64 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditingSummary(false)}
                      className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveSummary}
                      disabled={updateSummaryMutation.isPending}
                      className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updateSummaryMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-slate max-w-none">
                  <div className="text-gray-700 leading-relaxed text-base max-h-96 overflow-y-auto pr-4 custom-scrollbar">
                    {summary.summaryText}
                  </div>
                  {summary.isEdited && summary.editedAt && (
                    <p className="text-xs text-amber-600 mt-4">
                      Edited {formatDate(summary.editedAt)}
                    </p>
                  )}
                </div>
              )
            ) : (
              <div className="text-center py-12">
                <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No summary generated yet</p>
                {transcriptions.length > 0 && (
                  <button
                    onClick={() => generateSummaryMutation.mutate()}
                    disabled={generateSummaryMutation.isPending}
                    className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    {generateSummaryMutation.isPending ? 'Generating...' : 'Generate Summary'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Transcript Section */}
          <div className="border-t border-gray-200">
            <button
              onClick={() => toggleSection('transcript')}
              className="w-full px-8 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-600" />
                <span className="font-semibold text-gray-900">Full Transcript</span>
                <span className="text-sm text-gray-500">
                  ({transcriptions.length} segments)
                </span>
              </div>
              {expandedSections.has('transcript') ? (
                <ChevronDown className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-600" />
              )}
            </button>
            {expandedSections.has('transcript') && (
              <div className="px-8 py-6 bg-gray-50 border-t border-gray-200 max-h-96 overflow-y-auto space-y-4">
                {transcriptions.map((t) => (
                  <div key={t.id} className="bg-white p-4 border-l-4 border-blue-500">
                    <div className="text-xs text-gray-500 mb-2">
                      {Math.floor(t.startTime / 60)}:{String(Math.floor(t.startTime % 60)).padStart(2, '0')} -
                      {Math.floor(t.endTime / 60)}:{String(Math.floor(t.endTime % 60)).padStart(2, '0')}
                    </div>
                    <p className="text-gray-700">{t.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Right Panel - TODO List */}
      <aside className="w-96 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">DM Prep TODO</h2>
          </div>
          <div className="flex gap-2 mt-4">
            {dmTodoList && !isEditingTodo && (
              <button
                onClick={handleEditTodo}
                className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                <Edit3 className="h-3 w-3 inline mr-1" />
                Edit
              </button>
            )}
            <button
              onClick={() => generateTodoMutation.mutate()}
              disabled={generateTodoMutation.isPending}
              className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              <RefreshCw className={`h-3 w-3 inline mr-1 ${generateTodoMutation.isPending ? 'animate-spin' : ''}`} />
              {dmTodoList ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>

        <div className="p-6">
          {dmTodoList ? (
            isEditingTodo ? (
              <div className="space-y-4">
                <textarea
                  value={editedTodoText}
                  onChange={(e) => setEditedTodoText(e.target.value)}
                  className="w-full h-96 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingTodo(false)}
                    className="flex-1 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTodo}
                    disabled={updateTodoMutation.isPending}
                    className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    {updateTodoMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="prose prose-sm prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: marked(dmTodoList.content) as string }}
              />
            )
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-700 mb-4">No TODO list yet</p>
              {transcriptions.length > 0 && (
                <button
                  onClick={() => generateTodoMutation.mutate()}
                  disabled={generateTodoMutation.isPending}
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  {generateTodoMutation.isPending ? 'Generating...' : 'Generate TODO'}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .border-l-3 {
          border-left-width: 3px;
        }
      `}</style>
    </div>
  );
}
