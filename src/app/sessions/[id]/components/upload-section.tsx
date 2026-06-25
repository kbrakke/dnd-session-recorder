'use client';

import { AlertCircle, RefreshCw, Upload, CheckCircle } from 'lucide-react';
import { useUploadState } from '../hooks/use-upload-state';

interface UploadSectionProps {
  sessionId: string;
}

export function UploadSection({ sessionId }: UploadSectionProps) {
  const {
    selectedFile,
    setSelectedFile,
    showExistingUploads,
    setShowExistingUploads,
    uploads,
    uploadFile,
    isUploading,
    uploadError,
    linkExistingUpload,
    linkingUploadId,
  } = useUploadState({ sessionId });

  return (
    <div
      className="border-b"
      style={{
        background: 'var(--sp-bg-sunken)',
        borderColor: 'var(--sp-border)',
      }}
    >
      <div className="px-6 py-4">
        <div className="flex items-start gap-4">
          <AlertCircle
            className="h-6 w-6 flex-shrink-0 mt-1"
            style={{ color: 'var(--sp-error-fg-soft)' }}
          />
          <div className="flex-1">
            <h3
              className="text-lg font-semibold mb-2 font-display"
              style={{ color: 'var(--sp-fg-1)' }}
            >
              No audio file
            </h3>
            <p className="mb-4 text-sm" style={{ color: 'var(--sp-fg-3)' }}>
              This session has no audio file attached. Upload an audio recording to
              generate transcriptions and AI summaries.
            </p>

            {uploadError && (
              <div
                className="mb-4 p-3 rounded-[6px] border"
                style={{
                  background: 'var(--sp-bg-sunken)',
                  borderColor: 'var(--sp-error-bd)',
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle
                    className="h-5 w-5 flex-shrink-0 mt-0.5"
                    style={{ color: 'var(--sp-error-fg-soft)' }}
                  />
                  <div className="flex-1">
                    <p
                      className="text-sm font-medium"
                      style={{ color: 'var(--sp-error-fg-soft)' }}
                    >
                      Upload failed
                    </p>
                    <p
                      className="text-sm mt-1 opacity-80"
                      style={{ color: 'var(--sp-error-fg-soft)' }}
                    >
                      {uploadError.message}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {!showExistingUploads ? (
                <>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="block text-sm file:mr-4 file:py-2 file:px-4 file:rounded-[4px] file:border-0 file:text-sm file:font-semibold file:cursor-pointer"
                      style={{ color: 'var(--sp-fg-1)' }}
                      disabled={isUploading}
                    />
                    {selectedFile && (
                      <button
                        onClick={() => uploadFile(selectedFile)}
                        disabled={isUploading}
                        className="px-4 py-2 text-sm font-semibold rounded-[4px] disabled:opacity-50 flex items-center gap-2"
                        style={{
                          background: 'var(--sp-primary)',
                          color: 'var(--sp-on-primary)',
                          border: '1px solid var(--sp-primary-border)',
                          boxShadow: 'var(--sp-shadow-btn)',
                        }}
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            Upload & process
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: 'var(--sp-fg-3)' }}>
                    Or{' '}
                    <button
                      onClick={() => setShowExistingUploads(true)}
                      className="underline hover:opacity-80 font-medium"
                    >
                      link an existing upload
                    </button>
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <h4
                      className="text-sm font-semibold"
                      style={{ color: 'var(--sp-fg-1)' }}
                    >
                      Select an upload
                    </h4>
                    <button
                      onClick={() => setShowExistingUploads(false)}
                      className="text-sm hover:opacity-80"
                      style={{ color: 'var(--sp-fg-3)' }}
                    >
                      Cancel
                    </button>
                  </div>
                  {uploads.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--sp-fg-3)' }}>
                      No existing uploads found.
                    </p>
                  ) : (
                    <div
                      className="max-h-64 overflow-y-auto space-y-2 rounded-[6px] p-2 border"
                      style={{
                        borderColor: 'var(--sp-border)',
                        background: 'var(--sp-bg-surface)',
                      }}
                    >
                      {uploads.map((upload) => (
                        <button
                          key={upload.id}
                          onClick={() => linkExistingUpload(upload.id)}
                          disabled={linkingUploadId === upload.id}
                          className="w-full text-left p-3 rounded-[6px] border hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: 'var(--sp-bg-sunken)',
                            borderColor: 'var(--sp-border)',
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-medium truncate"
                                style={{ color: 'var(--sp-fg-1)' }}
                              >
                                {upload.originalName}
                              </p>
                              <div
                                className="flex items-center gap-2 mt-1 text-xs"
                                style={{ color: 'var(--sp-fg-3)' }}
                              >
                                <span>
                                  {(upload.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                                {upload.duration && (
                                  <span>
                                    · {Math.floor(upload.duration / 60)}m{' '}
                                    {upload.duration % 60}s
                                  </span>
                                )}
                              </div>
                            </div>
                            {linkingUploadId === upload.id ? (
                              <RefreshCw
                                className="h-4 w-4 animate-spin flex-shrink-0 ml-2"
                                style={{ color: 'var(--sp-primary)' }}
                              />
                            ) : (
                              <CheckCircle
                                className="h-4 w-4 flex-shrink-0 ml-2"
                                style={{ color: 'var(--sp-fg-3)' }}
                              />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
