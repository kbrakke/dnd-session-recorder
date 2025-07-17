'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, BookOpen, ArrowLeft, AlertCircle, Sparkles, Download, Copy } from 'lucide-react';
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
}

export default function SessionSummaryPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [copied, setCopied] = useState(false);

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
            <p className="text-gray-600">AI Generated Summary</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
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
          <div className="flex items-center space-x-3">
            <Sparkles className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">AI Generated Summary</h2>
          </div>
          {summary && (
            <p className="text-gray-600 mt-1">
              Generated on {formatDate(summary.createdAt)} using GPT-4
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
              <Link href={`/sessions/${sessionId}`}>
                <Button>Back to Session Details</Button>
              </Link>
            </div>
          ) : (
            <div className="prose prose-lg max-w-none">
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
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}