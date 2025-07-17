'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, BookOpen, ArrowLeft, AlertCircle, FileText, Download, Search } from 'lucide-react';
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

interface Transcription {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

export default function SessionTranscriptPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [searchTerm, setSearchTerm] = useState('');

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

  const formatTimestamp = (startTime: number, endTime: number) => {
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  };

  const exportTranscript = () => {
    if (!transcriptions || !session) return;
    
    let content = `${session.title}\n`;
    content += `Campaign: ${session.campaign.name}\n`;
    content += `Date: ${formatDate(session.sessionDate)}\n`;
    content += `Duration: ${formatDuration(session.duration)}\n`;
    content += `Transcription Segments: ${transcriptions.length}\n\n`;
    content += '--- TRANSCRIPT ---\n\n';
    
    transcriptions.forEach((transcript, index) => {
      content += `[${formatTimestamp(transcript.startTime, transcript.endTime)}] ${transcript.text}\n\n`;
    });
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredTranscriptions = transcriptions?.filter(transcript => 
    searchTerm === '' || transcript.text.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

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
        <p className="text-gray-500 mb-6">The session you're looking for doesn't exist.</p>
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
            <p className="text-gray-600">Full Transcript</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={exportTranscript}
            disabled={!transcriptions || transcriptions.length === 0}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
        </div>
      </div>

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
              <FileText className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Segments</p>
              <p className="text-lg font-semibold text-gray-900">{session._count?.transcriptions || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        {searchTerm && (
          <p className="mt-2 text-sm text-gray-600">
            Found {filteredTranscriptions.length} segments matching "{searchTerm}"
          </p>
        )}
      </div>

      {/* Transcript */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Transcript</h2>
          <p className="text-gray-600 mt-1">
            {filteredTranscriptions.length} of {session._count?.transcriptions || 0} segments
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>
        
        <div className="p-6">
          {transcriptionsLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading transcript...</p>
            </div>
          ) : filteredTranscriptions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? 'No matches found' : 'No transcript available'}
              </h3>
              <p className="text-gray-500">
                {searchTerm 
                  ? 'Try different search terms or clear the search to view all segments.'
                  : 'This session does not have any transcription data.'
                }
              </p>
              {searchTerm && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSearchTerm('')}
                >
                  Clear Search
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTranscriptions.map((transcript, index) => (
                <div
                  key={transcript.id}
                  className="flex space-x-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-shrink-0 w-24">
                    <div className="text-sm font-medium text-blue-600">
                      {formatTime(transcript.startTime)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {Math.round(transcript.confidence * 100)}%
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-900 leading-relaxed">
                      {searchTerm ? (
                        transcript.text
                          .split(new RegExp(`(${searchTerm})`, 'gi'))
                          .map((part, i) => 
                            part.toLowerCase() === searchTerm.toLowerCase() ? (
                              <mark key={i} className="bg-yellow-200 px-1 rounded">
                                {part}
                              </mark>
                            ) : (
                              part
                            )
                          )
                      ) : (
                        transcript.text
                      )}
                    </p>
                  </div>
                </div>
              ))}
              
              {/* Pagination info */}
              {filteredTranscriptions.length > 0 && (
                <div className="text-center pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Showing {filteredTranscriptions.length} segments
                    {session.duration && (
                      <> • Total duration: {formatDuration(session.duration)}</>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}