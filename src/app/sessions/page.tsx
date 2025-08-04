'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Clock, Mic, Plus, BookOpen, Play, FileText, Sparkles, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';

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

export default function SessionsPage() {
  const [filter, setFilter] = useState<'all' | 'completed' | 'processing' | 'error'>('all');

  const { data: sessions, isLoading } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <Play className="h-4 w-4" />;
      case 'processing': return <Clock className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'error': return <AlertCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const filteredSessions = sessions?.filter(session => {
    if (filter === 'all') return true;
    return session.status === filter;
  }) || [];

  const totalHours = sessions?.reduce((acc, session) => {
    return acc + (session.duration || 0);
  }, 0) || 0;

  const statusCounts = {
    all: sessions?.length || 0,
    completed: sessions?.filter(s => s.status === 'completed').length || 0,
    processing: sessions?.filter(s => s.status === 'processing').length || 0,
    error: sessions?.filter(s => s.status === 'error').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-600 mt-1">Total: {formatDuration(totalHours)}</p>
        </div>
        <Link href="/sessions/upload">
          <Button className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>New Session</span>
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All Sessions', count: statusCounts.all },
            { key: 'completed', label: 'Completed', count: statusCounts.completed },
            { key: 'processing', label: 'Processing', count: statusCounts.processing },
            { key: 'error', label: 'Error', count: statusCounts.error },
          ].map((filterOption) => (
            <button
              key={filterOption.key}
              onClick={() => setFilter(filterOption.key as typeof filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === filterOption.key
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filterOption.label} ({filterOption.count})
            </button>
          ))}
        </div>
      </div>

      {/* Sessions List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-2">Loading sessions...</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Mic className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {filter === 'all' ? 'No sessions yet' : `No ${filter} sessions`}
          </h3>
          <p className="text-gray-500 mb-6">
            {filter === 'all' 
              ? 'Upload your first D&D session to get started!'
              : `No sessions with ${filter} status found.`
            }
          </p>
          {filter === 'all' && (
            <Link href="/sessions/upload">
              <Button className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Upload Session</span>
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredSessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{session.title}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(session.status)}`}>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(session.status)}
                        <span className="capitalize">{session.status}</span>
                      </div>
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600 mb-4">
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
                      <span>{formatDuration(session.duration)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{session._count.transcriptions > 0 ? '✓' : '—'}</div>
                  <div className="text-sm text-gray-600">Transcribed</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{formatDuration(session.total_speech_time)}</div>
                  <div className="text-sm text-gray-600">Speech Time</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">{session.summary ? '✓' : '—'}</div>
                  <div className="text-sm text-gray-600">Summary</div>
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
                      <AlertCircle className="h-4 w-4" />
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
  );
}