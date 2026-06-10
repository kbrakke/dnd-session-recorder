'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Calendar, BookOpen, Plus, FileAudio, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { logger } from '@/lib/logger';

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

interface Session {
  id: string;
  title: string;
  campaignId: string;
  sessionDate: string;
  status: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface FormState {
  title: string;
  campaignId: string;
  sessionDate: string;
}

interface CampaignFormState {
  name: string;
  description: string;
  systemPrompt: string;
}

interface UploadState {
  selectedFile: File | null;
  selectedUpload: Upload | null;
  dragActive: boolean;
  mode: 'new' | 'existing' | 'skip';
}

interface ModalState {
  showCreateCampaign: boolean;
  campaignForm: CampaignFormState;
}

function SessionUploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const [formState, setFormState] = useState<FormState>({
    title: '',
    campaignId: '',
    sessionDate: new Date().toISOString().split('T')[0],
  });

  const [uploadState, setUploadState] = useState<UploadState>({
    selectedFile: null,
    selectedUpload: null,
    dragActive: false,
    mode: 'new',
  });

  const [modalState, setModalState] = useState<ModalState>({
    showCreateCampaign: false,
    campaignForm: { name: '', description: '', systemPrompt: '' },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get uploadId and campaignId from query params if present
  const preSelectedUploadId = searchParams.get('uploadId');
  const preSelectedCampaignId = searchParams.get('campaignId');

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

  // Pre-select upload if uploadId query param is present
  useEffect(() => {
    if (preSelectedUploadId && uploads.length > 0 && !uploadState.selectedUpload) {
      const upload = uploads.find(u => u.id === preSelectedUploadId);
      if (upload) {
        setUploadState((prev) => ({
          ...prev,
          selectedUpload: upload,
          mode: 'existing',
        }));
      }
    }
  }, [preSelectedUploadId, uploads, uploadState.selectedUpload]);

  // Pre-select campaign if campaignId query param is present
  useEffect(() => {
    if (preSelectedCampaignId && campaigns.length > 0 && !formState.campaignId) {
      const campaign = campaigns.find(c => c.id === preSelectedCampaignId);
      if (campaign) {
        setFormState((prev) => ({
          ...prev,
          campaignId: preSelectedCampaignId,
        }));
      }
    }
  }, [preSelectedCampaignId, campaigns, formState.campaignId]);

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: {
      title: string;
      campaign_id: string;
      session_date: string;
      upload_id?: string;
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
      setModalState({
        showCreateCampaign: false,
        campaignForm: { name: '', description: '', systemPrompt: '' },
      });
      // Automatically select the newly created campaign
      setFormState((prev) => ({ ...prev, campaignId: newCampaign.id }));
    },
  });

  // Handle file selection
  const handleFileSelect = (file: File) => {
    if (file.type.startsWith('audio/')) {
      setUploadState((prev) => ({ ...prev, selectedFile: file }));
    } else {
      alert('Please select an audio file');
    }
  };

  // Handle campaign creation
  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaignMutation.mutate(modalState.campaignForm);
  };

  const openCreateCampaignModal = () => {
    setModalState({
      showCreateCampaign: true,
      campaignForm: { name: '', description: '', systemPrompt: '' },
    });
  };

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setUploadState((prev) => ({ ...prev, dragActive: true }));
    } else if (e.type === 'dragleave') {
      setUploadState((prev) => ({ ...prev, dragActive: false }));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState((prev) => ({ ...prev, dragActive: false }));

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.title || !formState.campaignId || !formState.sessionDate) {
      alert('Please fill in all required fields');
      return;
    }

    if (isSubmitting) {
      return; // Prevent double submission
    }

    setIsSubmitting(true);

    try {
      // Use atomic session creation endpoint with file upload
      if (uploadState.mode === 'new' && uploadState.selectedFile) {
        // Atomic creation: upload file + create session in one request
        const formDataToSend = new FormData();
        formDataToSend.append('title', formState.title);
        formDataToSend.append('campaign_id', formState.campaignId);
        formDataToSend.append('session_date', new Date(formState.sessionDate).toISOString());
        formDataToSend.append('audio', uploadState.selectedFile);

        const response = await fetch('/api/sessions/create-with-upload', {
          method: 'POST',
          body: formDataToSend,
        });

        const result = await response.json();

        if (!response.ok && response.status !== 207) {
          // If we got a session ID despite the error, navigate to it
          if (result.sessionId) {
            alert(result.message || 'Session created but encountered an error');
            router.push(`/sessions/${result.sessionId}`);
            return;
          }
          throw new Error(result.error || 'Failed to create session');
        }

        // Success - navigate to session page to watch processing
        // Pass initial state via URL to enable optimistic UI rendering
        logger.info('Session created successfully', { sessionId: result.session.id });
        router.push(`/sessions/${result.session.id}?initialState=processing`);

      } else if (uploadState.mode === 'existing' && uploadState.selectedUpload) {
        // Link existing upload to new session
        const session = await createSessionMutation.mutateAsync({
          title: formState.title,
          campaign_id: formState.campaignId,
          session_date: new Date(formState.sessionDate).toISOString(),
        });

        // Link the existing upload
        const linkResponse = await fetch(`/api/sessions/${session.id}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            upload_id: uploadState.selectedUpload.id,
            duration: uploadState.selectedUpload.duration
          }),
        });

        if (!linkResponse.ok) {
          alert('Session created but failed to link upload. You can link it from the session page.');
        } else {
          // Trigger processing
          fetch(`/api/sessions/${session.id}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch(err => logger.error('Failed to trigger processing', err instanceof Error ? err : new Error(String(err)), { sessionId: session.id }));
        }

        router.push(`/sessions/${session.id}?initialState=processing`);

      } else {
        // No upload - just create session
        const session = await createSessionMutation.mutateAsync({
          title: formState.title,
          campaign_id: formState.campaignId,
          session_date: new Date(formState.sessionDate).toISOString(),
        });

        router.push(`/sessions/${session.id}?initialState=processing`);
      }

    } catch (error) {
      logger.error('Session creation failed', error instanceof Error ? error : new Error(String(error)));
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        // Try to extract details from error message if it's a JSON parse error
        try {
          const match = error.message.match(/\{.*\}/);
          if (match) {
            const details = JSON.parse(match[0]);
            if (details.details) errorMessage += `\n\nDetails: ${details.details}`;
          }
        } catch {
          // Ignore parse errors
        }
      }
      alert(`Failed to create session: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

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
                value={formState.title}
                onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
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
                  value={formState.campaignId}
                  onChange={(e) => {
                    if (e.target.value === 'create-new') {
                      openCreateCampaignModal();
                    } else {
                      setFormState((prev) => ({ ...prev, campaignId: e.target.value }));
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
                  value={formState.sessionDate}
                  onChange={(e) => setFormState((prev) => ({ ...prev, sessionDate: e.target.value }))}
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
                onClick={() => setUploadState((prev) => ({ ...prev, mode: 'new' }))}
                className={`px-4 py-2 rounded-lg border-2 text-center transition-colors ${uploadState.mode === 'new'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
              >
                Upload New File
              </button>
              <button
                type="button"
                onClick={() => setUploadState((prev) => ({ ...prev, mode: 'existing' }))}
                className={`px-4 py-2 rounded-lg border-2 text-center transition-colors ${uploadState.mode === 'existing'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
              >
                Use Existing Upload
              </button>
              <button
                type="button"
                onClick={() => setUploadState((prev) => ({ ...prev, mode: 'skip' }))}
                className={`px-4 py-2 rounded-lg border-2 text-center transition-colors ${uploadState.mode === 'skip'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
              >
                Skip Audio
              </button>
            </div>
          </div>

          {uploadState.mode === 'skip' ? (
            <div className="text-center py-12 bg-green-50 rounded-lg border-2 border-green-200">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-900 mb-2">Audio Upload Skipped</h3>
              <p className="text-green-700">
                You can add audio to this session later from the session details page.
              </p>
            </div>
          ) : uploadState.mode === 'new' ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${uploadState.dragActive
                ? 'border-blue-400 bg-blue-50'
                : uploadState.selectedFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
                }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {uploadState.selectedFile ? (
                <div className="space-y-3">
                  <FileAudio className="h-12 w-12 text-green-600 mx-auto" />
                  <div>
                    <p className="text-lg font-medium text-gray-900">{uploadState.selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(uploadState.selectedFile.size)} • {uploadState.selectedFile.type}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setUploadState((prev) => ({ ...prev, selectedFile: null }))}
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
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${uploadState.selectedUpload?.id === upload.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                        }`}
                      onClick={() => setUploadState((prev) => ({ ...prev, selectedUpload: upload }))}
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
              !formState.title ||
              !formState.campaignId ||
              !formState.sessionDate ||
              campaignsLoading ||
              isSubmitting
            }
            className="flex items-center space-x-2"
          >
            <Upload className="h-4 w-4" />
            <span>{isSubmitting ? 'Creating...' : 'Create Session'}</span>
          </Button>
        </div>
      </form>

      {/* Create Campaign Modal */}
      {modalState.showCreateCampaign && (
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
                  value={modalState.campaignForm.name}
                  onChange={(e) => setModalState((prev) => ({
                    ...prev,
                    campaignForm: { ...prev.campaignForm, name: e.target.value },
                  }))}
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
                  value={modalState.campaignForm.description}
                  onChange={(e) => setModalState((prev) => ({
                    ...prev,
                    campaignForm: { ...prev.campaignForm, description: e.target.value },
                  }))}
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
                  value={modalState.campaignForm.systemPrompt}
                  onChange={(e) => setModalState((prev) => ({
                    ...prev,
                    campaignForm: { ...prev.campaignForm, systemPrompt: e.target.value },
                  }))}
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
                  onClick={() => setModalState((prev) => ({ ...prev, showCreateCampaign: false }))}
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

export default function SessionUploadPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <SessionUploadPageContent />
    </Suspense>
  );
}