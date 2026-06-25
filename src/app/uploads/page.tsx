'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileAudio, Trash2, Plus, Calendar, Clock, PlayCircle } from 'lucide-react';
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
  gamingSessions?: Array<{
    id: string;
    title: string;
    sessionDate: string;
    campaign: {
      name: string;
    };
  }>;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

export default function UploadsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: uploads = [], isLoading } = useQuery<Upload[]>({
    queryKey: ['uploads-with-sessions'],
    queryFn: async () => {
      const response = await fetch('/api/uploads?includeSessions=true');
      if (!response.ok) throw new Error('Failed to fetch uploads');
      const data = await response.json();
      return data.uploads || [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const response = await fetch(`/api/uploads/${uploadId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete upload');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploads-with-sessions'] });
      setDeleteConfirm(null);
    },
  });

  const handleDelete = (uploadId: string) => {
    deleteMutation.mutate(uploadId);
  };

  const handleCreateSession = (uploadId: string) => {
    router.push(`/sessions/upload?uploadId=${uploadId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Uploads</h1>
          <p className="text-gray-600 mt-2">
            Manage your uploaded audio files and create sessions
          </p>
        </div>
        <Button onClick={() => router.push('/sessions/upload')}>
          <Plus className="h-4 w-4 mr-2" />
          Upload New File
        </Button>
      </div>

      {uploads.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileAudio className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No uploads yet</h3>
          <p className="text-gray-600 mb-6">
            Upload an audio file to create your first session
          </p>
          <Button onClick={() => router.push('/sessions/upload')}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Audio File
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {uploads.map((upload) => {
            const hasSession = upload.gamingSessions && upload.gamingSessions.length > 0;
            const canDelete = !hasSession;

            return (
              <div
                key={upload.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className="bg-blue-100 p-3 rounded-lg">
                      <FileAudio className="h-6 w-6 text-blue-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {upload.originalName}
                      </h3>

                      <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>{formatFileSize(upload.size)}</span>
                        </div>

                        {upload.duration && (
                          <div className="flex items-center gap-1">
                            <PlayCircle className="h-4 w-4" />
                            <span>{formatDuration(upload.duration)}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {new Date(upload.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Associated Sessions */}
                      {hasSession && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <p className="text-sm font-medium text-gray-700 mb-2">
                            Used in {upload.gamingSessions!.length} session{upload.gamingSessions!.length !== 1 ? 's' : ''}:
                          </p>
                          <div className="space-y-2">
                            {upload.gamingSessions!.map((session) => (
                              <button
                                key={session.id}
                                onClick={() => router.push(`/sessions/${session.id}`)}
                                className="block w-full text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {session.title}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                      {session.campaign.name} • {new Date(session.sessionDate).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <PlayCircle className="h-4 w-4 text-gray-400" />
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {!hasSession && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCreateSession(upload.id)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Create Session
                      </Button>
                    )}

                    {canDelete && (
                      deleteConfirm === upload.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Delete?</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDelete(upload.id)}
                            disabled={deleteMutation.isPending}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {deleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirm(upload.id)}
                          className="text-red-600 hover:bg-red-50 border-red-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )
                    )}

                    {!canDelete && (
                      <div className="text-xs text-gray-500 px-3 py-2 bg-gray-50 rounded-lg">
                        In use
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
