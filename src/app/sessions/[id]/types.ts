// Shared types for session detail page

export type SessionStatus =
  | 'draft'
  | 'uploaded'
  | 'transcribing'
  | 'transcribed'
  | 'summarizing'
  | 'completed'
  | 'error';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  sessions?: GamingSession[];
}

export interface GamingSession {
  id: string;
  title: string;
  sessionDate: string;
  duration: number | null;
  status: SessionStatus;
  campaign: Campaign;
  campaignId: string;
}

export interface SessionDetail extends GamingSession {
  uploadId: string | null;
  createdAt: string;
  currentStep: string | null;
  totalChunks: number | null;
  chunksCompleted: number | null;
  transcriptionProgress: number | null;
  errorStep: string | null;
  errorMessage: string | null;
  lastError: string | null;
  processingStartedAt: string | null;
  lastProgressAt: string | null;
  _count: {
    transcriptions: number;
  };
}

/** Shape of GET /api/sessions/[id]/progress — the lightweight polling feed. */
export interface SessionProgress {
  status: SessionStatus;
  duration: number | null;
  transcriptionProgress: number;
  totalChunks: number;
  chunksCompleted: number;
  currentStep: string | null;
  errorStep: string | null;
  errorMessage: string | null;
  job: {
    id: string;
    status: string;
    step: string | null;
    attempts: number;
    maxAttempts: number;
    nextRunAt: string | null;
    lastError: string | null;
  } | null;
}

export interface Summary {
  id: number;
  summaryText: string;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
}

export interface DmTodoList {
  id: number;
  content: string;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
}

export interface Transcription {
  id: number;
  text: string;
  startTime: number;
  endTime: number;
}

export interface Upload {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  duration: number | null;
  createdAt: string;
}

export interface ProcessingStep {
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  isActive: boolean;
  isLast?: boolean;
  onStart?: () => void;
  onCancel?: () => void;
  progressPercent?: number;
  minutesElapsed?: number;
  isTimedOut?: boolean;
  subStatus?: string;
}

export interface SessionToDelete {
  id: string;
  title: string;
  campaignId: string;
}

export interface UIState {
  expandedSections: Set<string>;
  currentTheme: string;
}

export interface EditingState {
  summary: {
    isEditing: boolean;
    text: string;
  };
  todo: {
    isEditing: boolean;
    text: string;
  };
}

export interface UploadState {
  selectedFile: File | null;
  isUploading: boolean;
  showExistingUploads: boolean;
  linkingUploadId: string | null;
  error: string | null;
}

export interface DeleteState {
  showModal: boolean;
  session: SessionToDelete | null;
}
