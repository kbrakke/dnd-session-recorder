'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Calendar, Clock, BookOpen, Scroll, Feather, Archive, PenTool } from 'lucide-react';
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
      case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'processing': return 'bg-blue-100 text-blue-900 border-blue-200';
      case 'pending': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const recentSessions = sessions?.slice(0, 6) || [];

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/sessions/upload" className="flex-1">
            <div className="bg-gradient-to-r from-blue-900 to-blue-950 text-white p-4 rounded-lg hover:from-blue-800 hover:to-blue-900 transition-all duration-200 flex items-center space-x-3 shadow-lg hover:shadow-xl">
              <PenTool className="h-6 w-6" />
              <div>
                <h3 className="font-semibold text-lg">Start New Session</h3>
                <p className="text-blue-100 text-sm">Record and transcribe your D&D adventure</p>
              </div>
            </div>
          </Link>
          <Link href="/campaigns" className="flex-1">
            <div className="bg-gradient-to-r from-blue-800 to-blue-900 text-white p-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center space-x-3 shadow-lg hover:shadow-xl">
              <BookOpen className="h-6 w-6" />
              <div>
                <h3 className="font-semibold text-lg">Manage Campaigns</h3>
                <p className="text-blue-100 text-sm">Organize your ongoing adventures</p>
              </div>
            </div>
          </Link>
          <Link href="/sessions" className="flex-1">
            <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white p-4 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center space-x-3 shadow-lg hover:shadow-xl">
              <Archive className="h-6 w-6" />
              <div>
                <h3 className="font-semibold text-lg">View Sessions</h3>
                <p className="text-blue-100 text-sm">Browse your recorded adventures</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Sessions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Recent Sessions</h2>
          <Link href="/sessions">
            <Button variant="outline" size="sm" className="flex items-center space-x-2">
              <Archive className="h-4 w-4" />
              <span>View All</span>
            </Button>
          </Link>
        </div>

        {sessionsLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600 mx-auto"></div>
            <p className="text-slate-600 mt-2 text-sm">Loading...</p>
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
            <Scroll className="h-12 w-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No sessions yet</h3>
            <p className="text-slate-600 mb-4 text-sm">Start recording your first D&D session to see it here</p>
            <Link href="/sessions/upload">
              <Button size="sm" className="flex items-center space-x-2">
                <PenTool className="h-4 w-4" />
                <span>Start Recording</span>
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {recentSessions.map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <div className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-semibold text-slate-900">{session.title}</h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(session.status)}`}>
                            {session.status}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-slate-600">
                          <div className="flex items-center">
                            <BookOpen className="h-3 w-3 mr-1" />
                            <span>{session.campaign_name}</span>
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            <span>{formatDate(session.sessionDate)}</span>
                          </div>
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>{formatDuration(session.duration)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {session.status === 'completed' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                window.location.href = `/sessions/${session.id}/transcript`;
                              }}
                              className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs hover:bg-slate-200 transition-colors flex items-center space-x-1"
                            >
                              <Scroll className="h-3 w-3" />
                              <span>Transcript</span>
                            </button>
                            {session.summary && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.location.href = `/sessions/${session.id}/summary`;
                                }}
                                className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs hover:bg-slate-200 transition-colors flex items-center space-x-1"
                              >
                                <Feather className="h-3 w-3" />
                                <span>Summary</span>
                              </button>
                            )}
                          </>
                        )}
                        {session.status === 'processing' && (
                          <div className="flex items-center space-x-2 text-slate-600">
                            <div className="animate-spin rounded-full h-3 w-3 border-b border-slate-600"></div>
                            <span className="text-xs">Processing...</span>
                          </div>
                        )}
                        <div className="text-xs text-slate-500">
                          {session._count.transcriptions} parts
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Campaigns Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Recent Campaigns</h2>
          <Link href="/campaigns">
            <Button variant="outline" size="sm" className="flex items-center space-x-2">
              <BookOpen className="h-4 w-4" />
              <span>View All</span>
            </Button>
          </Link>
        </div>

        {campaignsLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600 mx-auto"></div>
            <p className="text-slate-600 mt-2 text-sm">Loading...</p>
          </div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
            <BookOpen className="h-12 w-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No campaigns yet</h3>
            <p className="text-slate-600 mb-4 text-sm">Create your first campaign to organize your D&D sessions</p>
            <Link href="/campaigns">
              <Button size="sm" className="flex items-center space-x-2">
                <BookOpen className="h-4 w-4" />
                <span>Create Campaign</span>
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {campaigns.slice(0, 5).map((campaign) => (
                <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                  <div className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-1">
                          <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
                        </div>
                        {campaign.description && (
                          <p className="text-sm text-slate-600 mb-2 line-clamp-2">{campaign.description}</p>
                        )}
                        <div className="flex items-center space-x-4 text-xs text-slate-500">
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            <span>Created {formatDate(campaign.created_at)}</span>
                          </div>
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>Updated {formatTimeAgo(campaign.updated_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {sessions?.filter(s => s.campaignId === campaign.id).length || 0} sessions
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}