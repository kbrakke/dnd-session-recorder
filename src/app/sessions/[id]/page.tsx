'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, BookOpen, FileText, Sparkles, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Session {
  id: number;
  title: string;
  sessionDate: string;
  duration: number | null;
  createdAt: string;
  status: string;
  errorStep: string | null;
  errorMessage: string | null;
  campaign: {
    name: string;
  };
  _count: {
    transcriptions: number;
  };
  summary: {
    id: number;
  } | null;
}

interface Transcription {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

interface Summary {
  id: number;
  summaryText: string;
  createdAt: string;
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      return response.json();
    },
  });

  const { data: transcriptions, isLoading: transcriptionsLoading } = useQuery<Transcription[]>({
    queryKey: ['transcriptions', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/transcription/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch transcriptions');
      return response.json();
    },
    enabled: !!sessionId,
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

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
      case 'completed': return <CheckCircle className="h-5 w-5" />;
      case 'processing': return <Clock className="h-5 w-5" />;
      case 'pending': return <Clock className="h-5 w-5" />;
      case 'error': return <AlertCircle className="h-5 w-5" />;
      default: return <Clock className="h-5 w-5" />;
    }
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
          <Link href="/sessions">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sessions
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{session.title}</h1>
        </div>
        <div className={`px-3 py-1 rounded-full border ${getStatusColor(session.status)}`}>
          <div className="flex items-center space-x-2">
            {getStatusIcon(session.status)}
            <span className="capitalize font-medium">{session.status}</span>
          </div>
        </div>
      </div>

      {/* Session Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        </div>
      </div>

      {/* Error Display */}
      {session.status === 'error' && session.errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold text-red-900">Processing Error</h3>
          </div>
          <p className="text-red-800 mb-2">
            <strong>Step:</strong> {session.errorStep}
          </p>
          <p className="text-red-800">{session.errorMessage}</p>
        </div>
      )}

      {/* Content Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transcription Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Transcription</h2>
            <span className="text-sm text-gray-500">
              {session._count?.transcriptions || 0} segments
            </span>
          </div>
          
          {transcriptionsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading transcription...</p>
            </div>
          ) : transcriptions && transcriptions.length > 0 ? (
            <div className="space-y-3">
              <div className="max-h-96 overflow-y-auto space-y-2">
                {transcriptions.slice(0, 10).map((transcription) => (
                  <div key={transcription.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">
                        {formatTime(transcription.startTime)} - {formatTime(transcription.endTime)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {Math.round(transcription.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">{transcription.text}</p>
                  </div>
                ))}
              </div>
              {transcriptions.length > 10 && (
                <div className="text-center pt-4 border-t">
                  <Link href={`/sessions/${sessionId}/transcript`}>
                    <Button variant="outline" size="sm" className="flex items-center space-x-2">
                      <FileText className="h-4 w-4" />
                      <span>View Full Transcript</span>
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No transcription available</p>
            </div>
          )}
        </div>

        {/* Summary Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">AI Summary</h2>
            {summary && (
              <span className="text-sm text-gray-500">
                Generated {formatDate(summary.createdAt)}
              </span>
            )}
          </div>
          
          {summaryLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading summary...</p>
            </div>
          ) : summary ? (
            <div className="space-y-3">
              <div className="max-h-96 overflow-y-auto">
                <p className="text-gray-800 leading-relaxed">{summary.summaryText}</p>
              </div>
              <div className="text-center pt-4 border-t">
                <Link href={`/sessions/${sessionId}/summary`}>
                  <Button variant="outline" size="sm" className="flex items-center space-x-2">
                    <Sparkles className="h-4 w-4" />
                    <span>View Full Summary</span>
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No summary available</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
        <div className="flex flex-wrap gap-3">
          {session.status === 'completed' && (
            <>
              <Link href={`/sessions/${sessionId}/transcript`}>
                <Button variant="outline" className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span>View Full Transcript</span>
                </Button>
              </Link>
              {summary && (
                <Link href={`/sessions/${sessionId}/summary`}>
                  <Button variant="outline" className="flex items-center space-x-2">
                    <Sparkles className="h-4 w-4" />
                    <span>View Full Summary</span>
                  </Button>
                </Link>
              )}
            </>
          )}
          <Link href="/sessions">
            <Button variant="outline">Back to All Sessions</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}