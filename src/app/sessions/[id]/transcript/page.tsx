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
  confidence: number | null;
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



  const exportTranscript = () => {
    if (!transcriptions || !session) return;
    
    let content = `${session.title}\n`;
    content += `Campaign: ${session.campaign.name}\n`;
    content += `Date: ${formatDate(session.sessionDate)}\n`;
    content += `Duration: ${formatDuration(session.duration)}\n\n`;
    content += '--- TRANSCRIPT ---\n\n';
    
    // For the new format, there should only be one transcription with all the text
    const mainTranscription = transcriptions[0];
    if (mainTranscription) {
      content += mainTranscription.text;
    }
    
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
              <p className="text-sm font-medium text-gray-500">Status</p>
              <p className="text-lg font-semibold text-gray-900">{session._count?.transcriptions > 0 ? 'Transcribed' : 'Not Transcribed'}</p>
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
            {filteredTranscriptions.length > 0 ? 'Transcript contains' : 'No matches found for'} &quot;{searchTerm}&quot;
          </p>
        )}
      </div>

      {/* Transcript */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Transcript</h2>
          <p className="text-gray-600 mt-1">
            {session._count?.transcriptions > 0 ? 'Full session transcript' : 'No transcript available'}
            {searchTerm && filteredTranscriptions.length > 0 && ` - showing search results for "${searchTerm}"`}
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
                  ? 'Try different search terms or clear the search to view the full transcript.'
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
            <div className="space-y-6">
              {/* Display single transcript text */}
              {transcriptions && transcriptions.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="prose max-w-none">
                    <p className="text-gray-900 leading-relaxed whitespace-pre-wrap text-base">
                      {searchTerm ? (
                        transcriptions[0].text
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
                        transcriptions[0].text
                      )}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Info */}
              {transcriptions && transcriptions.length > 0 && (
                <div className="text-center pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Full transcript • {transcriptions[0].text.length} characters
                    {session.duration && (
                      <> • Duration: {formatDuration(session.duration)}</>
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