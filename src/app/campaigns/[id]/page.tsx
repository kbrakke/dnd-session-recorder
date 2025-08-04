'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Calendar, Clock, BookOpen, ArrowLeft, AlertCircle, Play, Edit3, Save, X, FileText, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Session {
  id: string;
  title: string;
  sessionDate: string;
  duration: number | null;
  status: string;
  createdAt: string;
  _count: {
    transcriptions: number;
  };
  summary: { id: number } | null;
}

export default function CampaignDetailsPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const queryClient = useQueryClient();
  
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');

  const { data: campaign, isLoading: campaignLoading } = useQuery<Campaign>({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (!response.ok) throw new Error('Failed to fetch campaign');
      return response.json();
    },
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ['campaign-sessions', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions?campaignId=${campaignId}`);
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    enabled: !!campaignId,
  });

  // Update system prompt mutation
  const updatePromptMutation = useMutation({
    mutationFn: async (systemPrompt: string) => {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: campaign?.name,
          description: campaign?.description,
          systemPrompt 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update system prompt');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      setIsEditingPrompt(false);
      setEditedPrompt('');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'transcribing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'summarizing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'transcribed': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'uploaded': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'draft': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleEditPrompt = () => {
    setEditedPrompt(campaign?.systemPrompt || '');
    setIsEditingPrompt(true);
  };

  const handleSavePrompt = () => {
    updatePromptMutation.mutate(editedPrompt);
  };

  const handleCancelEdit = () => {
    setIsEditingPrompt(false);
    setEditedPrompt('');
  };

  // Sort sessions by date
  const sortedSessions = [...sessions].sort((a, b) => 
    new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime()
  );

  if (campaignLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-500 mt-2">Loading campaign...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Campaign not found</h3>
        <p className="text-gray-500 mb-6">The campaign you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/campaigns">
          <Button>Back to Campaigns</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/campaigns">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaigns
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{campaign.name}</h1>
            {campaign.description && (
              <p className="text-gray-600 mt-1">{campaign.description}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Created {formatDate(campaign.createdAt)}</p>
          <p className="text-sm text-gray-500">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Session Timeline</h2>
              <Link href="/sessions/upload">
                <Button size="sm" className="flex items-center space-x-2">
                  <Play className="h-4 w-4" />
                  <span>New Session</span>
                </Button>
              </Link>
            </div>

            {sessionsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading sessions...</p>
              </div>
            ) : sortedSessions.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No sessions yet for this campaign</p>
                <Link href="/sessions/upload">
                  <Button>Create First Session</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedSessions.map((session) => (
                  <Link key={session.id} href={`/sessions/${session.id}`}>
                    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                            <div className={`px-2 py-1 rounded-full border text-xs font-medium ${getStatusColor(session.status)}`}>
                              {session.status}
                            </div>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(session.sessionDate)}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4" />
                              <span>{formatDuration(session.duration)}</span>
                            </div>
                            {session._count.transcriptions > 0 && (
                              <div className="flex items-center space-x-1">
                                <FileText className="h-4 w-4" />
                                <span>Transcribed</span>
                              </div>
                            )}
                            {session.summary && (
                              <div className="flex items-center space-x-1">
                                <Sparkles className="h-4 w-4" />
                                <span>Summary</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-gray-400">
                          <ArrowLeft className="h-5 w-5 rotate-180" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* System Prompt Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Campaign Context</h2>
              {!isEditingPrompt && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditPrompt}
                  className="flex items-center space-x-1"
                >
                  <Edit3 className="h-3 w-3" />
                  <span>Edit</span>
                </Button>
              )}
            </div>

            {isEditingPrompt ? (
              <div className="space-y-4">
                <textarea
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  className="w-full h-64 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Enter campaign context (characters, setting, story details) to enhance AI summaries..."
                />
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={handleSavePrompt}
                    disabled={updatePromptMutation.isPending}
                    className="flex items-center space-x-1 flex-1"
                  >
                    <Save className="h-3 w-3" />
                    <span>{updatePromptMutation.isPending ? 'Saving...' : 'Save'}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={updatePromptMutation.isPending}
                    className="flex items-center space-x-1"
                  >
                    <X className="h-3 w-3" />
                    <span>Cancel</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {campaign.systemPrompt ? (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                    <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                      {campaign.systemPrompt}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm mb-3">No campaign context set</p>
                    <p className="text-xs text-gray-400 mb-4">
                      Add context to help AI generate better summaries
                    </p>
                    <Button size="sm" onClick={handleEditPrompt}>
                      Add Context
                    </Button>
                  </div>
                )}
                {campaign.systemPrompt && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      This context is included in AI summary generation for all sessions in this campaign.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}