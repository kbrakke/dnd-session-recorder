'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Upload, FileAudio, Calendar, BookOpen, Play, CheckCircle, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
}

interface UploadResponse {
  message: string;
  file: {
    filename: string;
    originalName: string;
    path: string;
    size: number;
    mimetype: string;
    duration: number | null;
  };
}

interface Session {
  id: number;
  title: string;
  campaignId: number;
  sessionDate: string;
  audioFilePath: string;
  status: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function SessionUploadPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    campaignId: '',
    sessionDate: new Date().toISOString().split('T')[0],
  });
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [processingStep, setProcessingStep] = useState<'upload' | 'transcribe' | 'summarize' | 'complete' | null>(null);

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append('audio', file);
      
      const response = await fetch('/api/upload', {
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

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: {
      title: string;
      campaign_id: number;
      session_date: string;
      audio_file_path: string;
      duration?: number;
    }): Promise<Session> => {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create session');
      }
      
      return response.json();
    },
  });

  // Transcription mutation
  const transcribeMutation = useMutation({
    mutationFn: async ({ sessionId, audioFilePath }: { sessionId: number; audioFilePath: string }) => {
      const response = await fetch(`/api/transcription/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioFilePath }),
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
    mutationFn: async (sessionId: number) => {
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

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile || !formData.title || !formData.campaignId) {
      alert('Please fill in all required fields and select an audio file');
      return;
    }

    try {
      // Step 1: Upload file
      setProcessingStep('upload');
      const uploadResult = await uploadMutation.mutateAsync(selectedFile);
      
      // Step 2: Create session
      const sessionData = {
        title: formData.title,
        campaign_id: parseInt(formData.campaignId),
        session_date: new Date(formData.sessionDate).toISOString(),
        audio_file_path: uploadResult.file.path,
        duration: uploadResult.file.duration,
      };
      
      const session = await createSessionMutation.mutateAsync(sessionData);
      setCurrentSession(session);
      
      // Step 3: Generate transcription
      setProcessingStep('transcribe');
      await transcribeMutation.mutateAsync({
        sessionId: session.id,
        audioFilePath: uploadResult.file.path,
      });
      
      // Step 4: Generate summary
      setProcessingStep('summarize');
      await summarizeMutation.mutateAsync(session.id);
      
      // Step 5: Complete
      setProcessingStep('complete');
      
    } catch (error) {
      console.error('Session processing error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Render processing status
  const renderProcessingStatus = () => {
    if (!processingStep) return null;

    const steps = [
      { key: 'upload', label: 'Uploading audio file', icon: Upload },
      { key: 'transcribe', label: 'Generating transcription', icon: FileAudio },
      { key: 'summarize', label: 'Creating AI summary', icon: Sparkles },
      { key: 'complete', label: 'Session ready!', icon: CheckCircle },
    ];

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Processing Session</h3>
        <div className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = step.key === processingStep;
            const isCompleted = steps.findIndex(s => s.key === processingStep) > index;
            
            return (
              <div key={step.key} className={`flex items-center space-x-3 p-3 rounded-lg ${
                isActive ? 'bg-blue-50 border border-blue-200' : 
                isCompleted ? 'bg-green-50 border border-green-200' : 
                'bg-gray-50 border border-gray-200'
              }`}>
                <Icon className={`h-5 w-5 ${
                  isActive ? 'text-blue-600' : 
                  isCompleted ? 'text-green-600' : 
                  'text-gray-400'
                }`} />
                <span className={`font-medium ${
                  isActive ? 'text-blue-900' : 
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
        
        {processingStep === 'complete' && currentSession && (
          <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-900">Session Created Successfully!</span>
            </div>
            <p className="text-green-700 text-sm mb-3">
              Your D&D session has been processed and is ready to view.
            </p>
            <div className="flex space-x-3">
              <Button
                size="sm"
                onClick={() => router.push(`/sessions/${currentSession.id}`)}
                className="flex items-center space-x-2"
              >
                <Play className="h-4 w-4" />
                <span>View Session</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/sessions')}
              >
                All Sessions
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (processingStep) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Processing Session</h1>
        </div>
        {renderProcessingStatus()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Upload New Session</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Session Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Session Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter session title"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign *
              </label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <select
                  value={formData.campaignId}
                  onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select a campaign</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Date *
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="date"
                  value={formData.sessionDate}
                  onChange={(e) => setFormData({ ...formData, sessionDate: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* File Upload */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Audio File</h2>
          
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
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
                  type="button"
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
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/sessions')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!selectedFile || !formData.title || !formData.campaignId || campaignsLoading}
            className="flex items-center space-x-2"
          >
            <Upload className="h-4 w-4" />
            <span>Create Session</span>
          </Button>
        </div>
      </form>
    </div>
  );
}