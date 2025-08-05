'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Calendar, Clock, Mic, Plus, BookOpen, Play, FileText, Sparkles, TrendingUp, Activity, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import LandingPage from '@/components/LandingPage';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface Session {
  id: string;
  title: string;
  sessionDate: string;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
  campaignId: string;
  campaign_name: string;
  total_speech_time: number;
  _count: {
    transcriptions: number;
  };
  summary: {
    id: number;
  } | null;
  status: string;
}



export default function Dashboard() {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const { data: sessions, isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return formatDate(dateString);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const recentSessions = sessions?.slice(0, 6) || [];
  const totalSessions = sessions?.length || 0;
  const totalCampaigns = campaigns?.length || 0;
  const totalHours = sessions?.reduce((total, session) => total + (session.duration || 0), 0) || 0;

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              Welcome back, Dungeon Master!
            </h1>
            <p className="text-blue-100 text-lg">
              Manage your D&D sessions with AI-powered transcription and summaries
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Sessions</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {sessionsLoading ? '...' : totalSessions}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  <TrendingUp className="h-4 w-4 inline mr-1" />
                  All time
                </p>
              </div>
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                <Mic className="h-7 w-7 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Active Campaigns</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {campaignsLoading ? '...' : totalCampaigns}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  <Users className="h-4 w-4 inline mr-1" />
                  Active
                </p>
              </div>
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
                <BookOpen className="h-7 w-7 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Hours</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {sessionsLoading ? '...' : formatDuration(totalHours)}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  <Activity className="h-4 w-4 inline mr-1" />
                  Recorded
                </p>
              </div>
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center">
                <Clock className="h-7 w-7 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">AI Summaries</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {sessionsLoading ? '...' : sessions?.filter(s => s.summary).length || 0}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  <Sparkles className="h-4 w-4 inline mr-1" />
                  Generated
                </p>
              </div>
              <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

      {/* Recent Sessions Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Recent Sessions</h2>
              <p className="text-gray-600 mt-1">Your latest D&D adventures with AI-powered insights</p>
            </div>
            <Link href="/sessions">
              <Button variant="outline" className="flex items-center space-x-2">
                <Play className="h-4 w-4" />
                <span>View All Sessions</span>
              </Button>
            </Link>
          </div>

          {sessionsLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading sessions...</p>
            </div>
          ) : recentSessions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Mic className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
              <p className="text-gray-500 mb-6">Start recording your first D&D session to see it here!</p>
              <Link href="/sessions/upload">
                <Button className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>Record First Session</span>
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {recentSessions.map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all duration-200 cursor-pointer">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900">{session.title}</h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(session.status)}`}>
                            {session.status}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                          <div className="flex items-center">
                            <BookOpen className="h-4 w-4 mr-1 text-green-600" />
                            <span>{session.campaign_name}</span>
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1 text-blue-600" />
                            <span>{formatDate(session.sessionDate)}</span>
                          </div>
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1 text-purple-600" />
                            <span>{formatTimeAgo(session.createdAt)}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="bg-blue-50 rounded-lg p-3">
                            <div className="text-2xl font-bold text-blue-600">{session._count.transcriptions}</div>
                            <div className="text-xs text-gray-500">Transcriptions</div>
                          </div>
                          <div className="bg-green-50 rounded-lg p-3">
                            <div className="text-2xl font-bold text-green-600">{formatDuration(session.duration)}</div>
                            <div className="text-xs text-gray-500">Duration</div>
                          </div>
                          <div className="bg-purple-50 rounded-lg p-3">
                            <div className="text-2xl font-bold text-purple-600">{session.summary ? '✓' : '—'}</div>
                            <div className="text-xs text-gray-500">Summary</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center space-x-2">
                        {session.status === 'completed' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                window.location.href = `/sessions/${session.id}/transcript`;
                              }}
                              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors flex items-center space-x-1"
                            >
                              <FileText className="h-4 w-4" />
                              <span>Transcript</span>
                            </button>
                            {session.summary && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.location.href = `/sessions/${session.id}/summary`;
                                }}
                                className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors flex items-center space-x-1"
                              >
                                <Sparkles className="h-4 w-4" />
                                <span>Summary</span>
                              </button>
                            )}
                          </>
                        )}
                        {session.status === 'processing' && (
                          <div className="flex items-center space-x-2 text-blue-600">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span className="text-sm">Processing...</span>
                          </div>
                        )}
                        {session.status === 'error' && (
                          <div className="flex items-center space-x-2 text-red-600">
                            <span className="text-sm">Processing failed</span>
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        Click to view details
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}