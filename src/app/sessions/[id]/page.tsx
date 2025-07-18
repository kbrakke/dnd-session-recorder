'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Calendar, Clock, BookOpen, FileText, Sparkles, ArrowLeft, AlertCircle, CheckCircle, Upload, FileAudio, Play, Edit3, Lock, Unlock, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Upload {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  duration?: number;
  status: string;
  createdAt: string;
}

interface Session {
  id: string;
  title: string;
  sessionDate: string;
  duration: number | null;
  createdAt: string;
  status: string;
  errorStep: string | null;
  errorMessage: string | null;
  uploadId: string | null;
  audioFilePath: string | null;
  campaign: {
    name: string;
  };
  upload: Upload | null;
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
  isEdited: boolean;
  editedAt: string | null;
  originalText: string | null;
}

interface UploadResponse {
  message: string;
  upload: Upload;
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const queryClient = useQueryClient();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<Upload | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadMode, setUploadMode] = useState<'new' | 'existing'>('new');
  const [processingStep, setProcessingStep] = useState<'upload' | 'link' | 'transcribe' | 'summarize' | 'complete' | null>(null);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummaryText, setEditedSummaryText] = useState('');

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

  // Fetch existing uploads for selection
  const { data: uploads = [], isLoading: uploadsLoading } = useQuery<Upload[]>({
    queryKey: ['uploads'],
    queryFn: async () => {
      const response = await fetch('/api/uploads');
      if (!response.ok) throw new Error('Failed to fetch uploads');
      const data = await response.json();
      return data.uploads || [];
    },
    enabled: session?.status === 'draft' && !session?.upload,
  });

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
  });

  // Link upload to session mutation
  const linkUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const response = await fetch(`/api/sessions/${sessionId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: uploadId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to link upload');
      }

      return response.json();
    },
  });

  // Transcription mutation
  const transcribeMutation = useMutation({
    mutationFn: async ({ upload }: { upload?: Upload } = {}) => {
      const response = await fetch(`/api/transcription/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          // Don't pass audioFilePath - let the server figure it out from the session
          ...(upload && { audioFilePath: upload.path || upload.filename })
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Transcription failed');
      }

      return response.json();
    },
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

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-5 w-5" />;
      case 'processing': return <Clock className="h-5 w-5" />;
      case 'pending': return <Clock className="h-5 w-5" />;
      case 'draft': return <FileText className="h-5 w-5" />;
      case 'uploaded': return <FileAudio className="h-5 w-5" />;
      case 'transcribed': return <FileText className="h-5 w-5" />;
      case 'error': return <AlertCircle className="h-5 w-5" />;
      default: return <Clock className="h-5 w-5" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle file selection
  const handleFileSelect = (file: File) => {
    if (file.type.startsWith('audio/')) {
      setSelectedFile(file);
    } else {
      alert('Please select an audio file');
    }
  };

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  // Handle audio upload and processing
  const handleAudioUpload = async () => {
    if (!session) return;

    const hasUpload = uploadMode === 'new' ? selectedFile : selectedUpload;
    if (!hasUpload) {
      alert('Please select an audio file or upload a new one');
      return;
    }

    try {
      let upload: Upload;
      
      if (uploadMode === 'new' && selectedFile) {
        // Step 1: Upload file
        setProcessingStep('upload');
        const uploadResult = await uploadMutation.mutateAsync(selectedFile);
        upload = uploadResult.upload;
      } else if (selectedUpload) {
        upload = selectedUpload;
      } else {
        throw new Error('No valid upload selected');
      }

      // Step 2: Link upload to session
      setProcessingStep('link');
      await linkUploadMutation.mutateAsync(upload.id);

      // Step 3: Generate transcription
      setProcessingStep('transcribe');
      await transcribeMutation.mutateAsync({ upload });

      // Step 4: Generate summary
      setProcessingStep('summarize');
      await summarizeMutation.mutateAsync();

      // Step 5: Complete
      setProcessingStep('complete');
      
      // Refresh session data
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['transcriptions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });

    } catch (error) {
      console.error('Audio upload and processing error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setProcessingStep(null);
    }
  };

  // Handle re-transcription for sessions with linked audio
  const handleRetranscribe = async () => {
    if (!session) return;

    try {
      // Step 1: Generate transcription
      setProcessingStep('transcribe');
      await transcribeMutation.mutateAsync();

      // Step 2: Generate summary
      setProcessingStep('summarize');
      await summarizeMutation.mutateAsync();

      // Step 3: Complete
      setProcessingStep('complete');
      
      // Reset processing step after a delay to show completion
      setTimeout(() => {
        setProcessingStep(null);
      }, 2000);
      
      // Refresh session data
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['transcriptions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['summary', sessionId] });

    } catch (error) {
      console.error('Re-transcription error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setProcessingStep(null);
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
      
      // Refresh session data
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
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

      {/* Audio File Info Section - Show for sessions with linked audio */}
      {session.upload && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <FileAudio className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Audio File</h3>
                <p className="text-sm text-gray-600">Linked audio file for this session</p>
              </div>
            </div>
            {(session.status === 'uploaded' || session.status === 'error') && !processingStep && (
              <Button
                onClick={handleRetranscribe}
                className="flex items-center space-x-2"
                disabled={transcribeMutation.isPending}
              >
                <Play className="h-4 w-4" />
                <span>
                  {transcribeMutation.isPending ? 'Processing...' : 'Run Transcription'}
                </span>
              </Button>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-4">
              <FileAudio className="h-10 w-10 text-gray-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{session.upload.originalName}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                  <span>{formatFileSize(session.upload.size)}</span>
                  <span>•</span>
                  <span>{session.upload.mimetype}</span>
                  {session.upload.duration && (
                    <>
                      <span>•</span>
                      <span>{formatDuration(session.upload.duration)}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Uploaded {formatDate(session.upload.createdAt)}
                </p>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium ${
                session.upload.status === 'transcribed' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {session.upload.status}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audio Upload Section - Show for draft sessions without audio */}
      {session.status === 'draft' && !session.upload && !processingStep && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileAudio className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Add Audio to Session</h3>
              <p className="text-sm text-gray-600">Upload an audio file to generate transcription and summary</p>
            </div>
          </div>

          {/* Upload Mode Selection */}
          <div className="mb-6">
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setUploadMode('new')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 text-center transition-colors ${
                  uploadMode === 'new'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                Upload New File
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('existing')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 text-center transition-colors ${
                  uploadMode === 'existing'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                Use Existing Upload
              </button>
            </div>
          </div>

          {uploadMode === 'new' ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                ? 'border-blue-400 bg-blue-50'
                : selectedFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
                }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="space-y-3">
                  <FileAudio className="h-12 w-12 text-green-600 mx-auto" />
                  <div>
                    <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(selectedFile.size)} • {selectedFile.type}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    Remove File
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      Drop your audio file here, or{' '}
                      <label className="text-blue-600 cursor-pointer hover:text-blue-700">
                        browse
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                    </p>
                    <p className="text-sm text-gray-500">
                      Supports MP3, WAV, OGG, M4A, AAC, FLAC, and WebM files
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {uploadsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-500 mt-2">Loading uploads...</p>
                </div>
              ) : uploads.length === 0 ? (
                <div className="text-center py-8">
                  <FileAudio className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">No uploaded files found</p>
                  <p className="text-sm text-gray-400">Upload a file first to use this option</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {uploads.map((upload) => (
                    <div
                      key={upload.id}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                        selectedUpload?.id === upload.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      onClick={() => setSelectedUpload(upload)}
                    >
                      <div className="flex items-center space-x-3">
                        <FileAudio className="h-8 w-8 text-gray-600" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{upload.originalName}</p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(upload.size)} • {upload.mimetype}
                            {upload.duration && ` • ${Math.round(upload.duration)}s`}
                          </p>
                          <p className="text-xs text-gray-400">
                            Uploaded {new Date(upload.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upload Button */}
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleAudioUpload}
              disabled={
                (uploadMode === 'new' && !selectedFile) ||
                (uploadMode === 'existing' && !selectedUpload)
              }
              className="flex items-center space-x-2"
            >
              <Play className="h-4 w-4" />
              <span>Upload and Process Audio</span>
            </Button>
          </div>
        </div>
      )}

      {/* Processing Status */}
      {processingStep && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {processingStep === 'summarize' && session?.upload ? 'Regenerating Summary' : 'Processing Audio'}
          </h3>
          <div className="space-y-4">
            {[
              { key: 'upload', label: 'Uploading audio file', icon: Upload },
              { key: 'link', label: 'Linking to session', icon: FileAudio },
              { key: 'transcribe', label: 'Generating transcription', icon: FileText },
              { key: 'summarize', label: 'Creating AI summary', icon: Sparkles },
              { key: 'complete', label: 'Processing complete!', icon: CheckCircle },
            ].filter(step => {
              // Show only relevant steps based on the current processing context
              if (processingStep === 'summarize' && session?.upload) {
                // For summary regeneration, show only summarize and complete
                return ['summarize', 'complete'].includes(step.key);
              }
              return true;
            }).map((step, index, filteredSteps) => {
              const Icon = step.icon;
              const isActive = step.key === processingStep;
              const isCompleted = filteredSteps.findIndex(s => s.key === processingStep) > index;

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
            <div className="flex items-center space-x-2">
              {summary && (
                <span className="text-sm text-gray-500">
                  Generated {formatDate(summary.createdAt)}
                  {summary.isEdited && summary.editedAt && (
                    <span className="text-amber-600 ml-1">
                      (edited {formatDate(summary.editedAt)})
                    </span>
                  )}
                </span>
              )}
              {/* Summary Actions */}
              {session && transcriptions && transcriptions.length > 0 && !processingStep && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateSummary}
                    disabled={summarizeMutation.isPending}
                    className="flex items-center space-x-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{summarizeMutation.isPending ? 'Generating...' : 'Regenerate'}</span>
                  </Button>
                  {summary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={isEditingSummary ? handleCancelSummaryEdit : handleEditSummary}
                      className="flex items-center space-x-1"
                    >
                      {isEditingSummary ? (
                        <>
                          <Unlock className="h-3 w-3" />
                          <span>Cancel</span>
                        </>
                      ) : (
                        <>
                          <Edit3 className="h-3 w-3" />
                          <span>Edit</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {summaryLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading summary...</p>
            </div>
          ) : summary ? (
            <div className="space-y-3">
              {isEditingSummary ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <Lock className="h-4 w-4 text-amber-600" />
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
                    className="w-full h-64 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your summary..."
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelSummaryEdit}
                      disabled={updateSummaryMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
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
                <div className="max-h-96 overflow-y-auto">
                  <p className="text-gray-800 leading-relaxed">{summary.summaryText}</p>
                </div>
              )}
              {!isEditingSummary && (
                <div className="text-center pt-4 border-t">
                  <Link href={`/sessions/${sessionId}/summary`}>
                    <Button variant="outline" size="sm" className="flex items-center space-x-2">
                      <Sparkles className="h-4 w-4" />
                      <span>View Full Summary</span>
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No summary available</p>
              {session && transcriptions && transcriptions.length > 0 && !processingStep && (
                <Button
                  onClick={handleRegenerateSummary}
                  disabled={summarizeMutation.isPending}
                  className="mt-4 flex items-center space-x-2"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{summarizeMutation.isPending ? 'Generating...' : 'Generate Summary'}</span>
                </Button>
              )}
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