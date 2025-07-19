'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileAudio, Calendar, BookOpen, Play, CheckCircle, Sparkles, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
}

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

interface UploadResponse {
  message: string;
  upload: Upload;
}

interface Session {
  id: string;
  title: string;
  campaignId: string;
  sessionDate: string;
  uploadId?: string;
  audioFilePath?: string;
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
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<Upload | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    campaignId: '',
    sessionDate: new Date().toISOString().split('T')[0],
  });
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [processingStep, setProcessingStep] = useState<'upload' | 'transcribe' | 'summarize' | 'complete' | null>(null);
  const [uploadMode, setUploadMode] = useState<'new' | 'existing' | 'skip'>('new');
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [campaignFormData, setCampaignFormData] = useState({ name: '', description: '', systemPrompt: '' });

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  // Fetch existing uploads
  const { data: uploads = [], isLoading: uploadsLoading } = useQuery<Upload[]>({
    queryKey: ['uploads'],
    queryFn: async () => {
      const response = await fetch('/api/uploads');
      if (!response.ok) throw new Error('Failed to fetch uploads');
      const data = await response.json();
      return data.uploads || [];
    },
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

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: {
      title: string;
      campaign_id: string;
      session_date: string;
      upload_id?: string;
      audio_file_path?: string;
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
    mutationFn: async ({ sessionId, upload }: { sessionId: string; upload: Upload }) => {
      const response = await fetch(`/api/transcription/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioFilePath: upload.filename }),
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
    mutationFn: async (sessionId: string) => {
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

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create campaign');
      }
      return response.json();
    },
    onSuccess: (newCampaign) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setShowCreateCampaignModal(false);
      setCampaignFormData({ name: '', description: '', systemPrompt: '' });
      // Automatically select the newly created campaign
      setFormData({ ...formData, campaignId: newCampaign.id });
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

  // Handle campaign creation
  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaignMutation.mutate(campaignFormData);
  };

  const openCreateCampaignModal = () => {
    setCampaignFormData({ name: '', description: '', systemPrompt: '' });
    setShowCreateCampaignModal(true);
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

    if (!formData.title || !formData.campaignId || !formData.sessionDate) {
      alert('Please fill in all required fields');
      return;
    }

    const hasUpload = uploadMode === 'skip' ? null : (uploadMode === 'new' ? selectedFile : selectedUpload);

    try {
      let upload: Upload | null = null;

      if (hasUpload) {
        if (uploadMode === 'new' && selectedFile) {
          // Step 1: Upload file
          setProcessingStep('upload');
          const uploadResult = await uploadMutation.mutateAsync(selectedFile);
          upload = uploadResult.upload;
        } else if (selectedUpload) {
          upload = selectedUpload;
        }
      }

      // Step 2: Create session
      const sessionData = {
        title: formData.title,
        campaign_id: formData.campaignId,
        session_date: new Date(formData.sessionDate).toISOString(),
        ...(upload && { upload_id: upload.id, duration: upload.duration }),
      };

      const session = await createSessionMutation.mutateAsync(sessionData);
      setCurrentSession(session);

      // Only proceed with transcription and summarization if we have an upload
      if (upload) {
        // Step 3: Generate transcription
        setProcessingStep('transcribe');
        await transcribeMutation.mutateAsync({
          sessionId: session.id,
          upload: upload,
        });

        // Step 4: Generate summary
        setProcessingStep('summarize');
        await summarizeMutation.mutateAsync(session.id);

        // Step 5: Complete
        setProcessingStep('complete');
      } else {
        // Session created without audio - redirect to session page
        router.push(`/sessions/${session.id}`);
      }

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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Session Details</h2>
          <p className="text-sm text-gray-600 mb-4">Fields marked with <span className="text-red-500">*</span> are required</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Title <span className="text-red-500">*</span>
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
                Campaign <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <select
                  value={formData.campaignId}
                  onChange={(e) => {
                    if (e.target.value === 'create-new') {
                      openCreateCampaignModal();
                    } else {
                      setFormData({ ...formData, campaignId: e.target.value });
                    }
                  }}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select a campaign</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                  {campaigns.length === 0 && (
                    <option value="create-new">➕ Create New Campaign</option>
                  )}
                </select>
                {campaigns.length > 0 && (
                  <button
                    type="button"
                    onClick={openCreateCampaignModal}
                    className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600 rounded"
                    title="Create new campaign"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Date <span className="text-red-500">*</span>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Audio File</h2>
          <p className="text-sm text-gray-600 mb-4">Optional - You can create a session without audio and add it later</p>

          {/* Upload Mode Selection */}
          <div className="mb-6">
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setUploadMode('new')}
                className={`px-4 py-2 rounded-lg border-2 text-center transition-colors ${uploadMode === 'new'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
              >
                Upload New File
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('existing')}
                className={`px-4 py-2 rounded-lg border-2 text-center transition-colors ${uploadMode === 'existing'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
              >
                Use Existing Upload
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('skip')}
                className={`px-4 py-2 rounded-lg border-2 text-center transition-colors ${uploadMode === 'skip'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
              >
                Skip Audio
              </button>
            </div>
          </div>

          {uploadMode === 'skip' ? (
            <div className="text-center py-12 bg-green-50 rounded-lg border-2 border-green-200">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-900 mb-2">Audio Upload Skipped</h3>
              <p className="text-green-700">
                You can add audio to this session later from the session details page.
              </p>
            </div>
          ) : uploadMode === 'new' ? (
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
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${selectedUpload?.id === upload.id
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
            disabled={
              !formData.title ||
              !formData.campaignId ||
              !formData.sessionDate ||
              campaignsLoading
            }
            className="flex items-center space-x-2"
          >
            <Upload className="h-4 w-4" />
            <span>Create Session</span>
          </Button>
        </div>
      </form>

      {/* Create Campaign Modal */}
      {showCreateCampaignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Campaign</h2>
            <form onSubmit={handleCreateCampaign} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={campaignFormData.name}
                  onChange={(e) => setCampaignFormData({ ...campaignFormData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Enter campaign name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={campaignFormData.description}
                  onChange={(e) => setCampaignFormData({ ...campaignFormData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  rows={3}
                  placeholder="Enter campaign description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  System Prompt (Optional)
                </label>
                <textarea
                  value={campaignFormData.systemPrompt}
                  onChange={(e) => setCampaignFormData({ ...campaignFormData, systemPrompt: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  rows={4}
                  placeholder="Enter campaign context (characters, setting, story details) to enhance AI summaries"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This information helps the AI generate more accurate and contextual summaries for your sessions.
                </p>
              </div>
              <div className="flex space-x-3 pt-2">
                <Button
                  type="submit"
                  disabled={createCampaignMutation.isPending}
                  className="flex-1"
                >
                  {createCampaignMutation.isPending ? 'Creating...' : 'Create Campaign'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateCampaignModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}