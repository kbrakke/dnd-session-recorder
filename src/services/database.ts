import { prisma } from '../lib/prisma';
import { Campaign, GamingSession, Transcription, Summary, Upload } from '@prisma/client';

export interface CreateCampaignData {
  name: string;
  description?: string;
  systemPrompt?: string;
  userId: string;
}

export interface CreateSessionData {
  campaignId: string;
  title: string;
  sessionDate: Date;
  uploadId?: string;
  audioFilePath?: string;
  duration?: number;
  status?: string;
}

export interface CreateUploadData {
  userId: string;
  filename: string;
  originalName: string;
  path: string;
  size: number;
  mimetype: string;
  duration?: number;
}

export interface SessionWithIncludes extends GamingSession {
  campaign: { name: string };
  transcriptions: Transcription[];
  summary: Summary | null;
  upload: Upload | null;
}

export interface SessionListItem extends GamingSession {
  campaign: { name: string };
  _count: {
    transcriptions: number;
  };
  summary: { id: number } | null;
}

export class DatabaseService {
  // Campaign operations
  async createCampaign(data: CreateCampaignData): Promise<Campaign> {
    return prisma.campaign.create({
      data: {
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        userId: data.userId,
      },
    });
  }
  
  async getCampaigns(userId?: string): Promise<(Campaign & { _count: { gamingSessions: number } })[]> {
    return prisma.campaign.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { gamingSessions: true },
        },
      },
    });
  }
  
  async getCampaignById(id: string): Promise<Campaign | null> {
    return prisma.campaign.findUnique({
      where: { id },
    });
  }
  
  async updateCampaign(id: string, data: Partial<CreateCampaignData>): Promise<Campaign> {
    return prisma.campaign.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
      },
    });
  }
  
  async deleteCampaign(id: string): Promise<void> {
    await prisma.campaign.delete({
      where: { id },
    });
  }
  
  // Session operations
  async createSession(data: CreateSessionData): Promise<GamingSession> {
    return prisma.gamingSession.create({
      data: {
        campaignId: data.campaignId,
        title: data.title,
        sessionDate: data.sessionDate,
        uploadId: data.uploadId,
        audioFilePath: data.audioFilePath,
        duration: data.duration,
        status: data.status || (data.uploadId ? 'uploaded' : 'draft'),
      },
    });
  }
  
  async getSessions(userId?: string, campaignId?: string): Promise<SessionListItem[]> {
    return prisma.gamingSession.findMany({
      where: {
        ...(userId && { campaign: { userId } }),
        ...(campaignId && { campaignId }),
      },
      include: {
        campaign: {
          select: { name: true },
        },
        _count: {
          select: { transcriptions: true },
        },
        summary: {
          select: { id: true },
        },
      },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
  
  async getSessionById(id: string): Promise<SessionWithIncludes | null> {
    return prisma.gamingSession.findUnique({
      where: { id },
      include: {
        campaign: {
          select: { name: true },
        },
        transcriptions: {
          orderBy: { startTime: 'asc' },
        },
        summary: true,
        upload: true,
      },
    });
  }
  
  
  async updateSessionStatus(id: string, status: string): Promise<GamingSession> {
    return prisma.gamingSession.update({
      where: { id },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }
  
  async setSessionError(id: string, step: string, message: string): Promise<GamingSession> {
    return prisma.gamingSession.update({
      where: { id },
      data: {
        errorStep: step,
        errorMessage: message,
        status: 'error',
        updatedAt: new Date(),
      },
    });
  }
  
  async clearSessionError(id: string): Promise<GamingSession> {
    return prisma.gamingSession.update({
      where: { id },
      data: {
        errorStep: null,
        errorMessage: null,
        updatedAt: new Date(),
      },
    });
  }
  
  async updateSession(id: string, data: {
    status?: string;
    errorStep?: string | null;
    errorMessage?: string | null;
    duration?: number;
    audioFilePath?: string;
    uploadId?: string | null;
  }): Promise<GamingSession> {
    return prisma.gamingSession.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }
  
  // Transcription operations
  async saveTranscriptions(sessionId: string, segments: { start: number; end: number; text: string; avg_logprob?: number }[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Delete existing transcriptions for this session
      await tx.transcription.deleteMany({
        where: { sessionId },
      });
      
      // Insert new transcriptions
      await tx.transcription.createMany({
        data: segments.map((segment) => ({
          sessionId,
          startTime: segment.start,
          endTime: segment.end,
          text: segment.text,
          confidence: segment.avg_logprob || 0,
        })),
      });
    });
  }
  
  async getTranscriptions(sessionId: string): Promise<Transcription[]> {
    return prisma.transcription.findMany({
      where: { sessionId },
      orderBy: { startTime: 'asc' },
    });
  }
  
  async getTranscriptionCount(sessionId: string): Promise<number> {
    return prisma.transcription.count({
      where: { sessionId },
    });
  }
  
  // Summary operations
  async saveSummary(sessionId: string, summaryText: string): Promise<Summary> {
    return prisma.summary.upsert({
      where: { sessionId },
      update: {
        summaryText,
      },
      create: {
        sessionId,
        summaryText,
      },
    });
  }

  async updateSummary(sessionId: string, summaryText: string): Promise<Summary> {
    // First get the current summary to preserve original text
    const currentSummary = await prisma.summary.findUnique({
      where: { sessionId },
    });
    
    if (!currentSummary) {
      throw new Error('Summary not found');
    }
    
    return prisma.summary.update({
      where: { sessionId },
      data: {
        summaryText,
        isEdited: true,
        editedAt: new Date(),
        originalText: currentSummary.originalText || currentSummary.summaryText,
      },
    });
  }
  
  async getSummary(sessionId: string): Promise<Summary | null> {
    return prisma.summary.findUnique({
      where: { sessionId },
    });
  }

  // Upload operations
  async createUpload(data: CreateUploadData): Promise<Upload> {
    return prisma.upload.create({
      data: {
        userId: data.userId,
        filename: data.filename,
        originalName: data.originalName,
        path: data.path,
        size: data.size,
        mimetype: data.mimetype,
        duration: data.duration,
        status: 'uploaded',
      },
    });
  }

  async getUploads(userId: string): Promise<Upload[]> {
    return prisma.upload.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUploadById(id: string): Promise<Upload | null> {
    return prisma.upload.findUnique({
      where: { id },
    });
  }

  async updateUploadStatus(id: string, status: string, chunkPaths?: string[]): Promise<Upload> {
    return prisma.upload.update({
      where: { id },
      data: {
        status,
        chunkPaths: chunkPaths ? JSON.stringify(chunkPaths) : undefined,
        updatedAt: new Date(),
      },
    });
  }

  async deleteUpload(id: string): Promise<void> {
    await prisma.upload.delete({
      where: { id },
    });
  }

  async getUploadUsage(id: string): Promise<{ sessionCount: number; sessions: GamingSession[] }> {
    const sessions = await prisma.gamingSession.findMany({
      where: { uploadId: id },
      include: {
        campaign: {
          select: { name: true },
        },
      },
    });

    return {
      sessionCount: sessions.length,
      sessions,
    };
  }

  async linkSessionToUpload(sessionId: string, uploadId: string): Promise<GamingSession> {
    return prisma.gamingSession.update({
      where: { id: sessionId },
      data: {
        uploadId,
        status: 'uploaded',
        updatedAt: new Date(),
      },
    });
  }

  async unlinkSessionFromUpload(sessionId: string): Promise<GamingSession> {
    return prisma.gamingSession.update({
      where: { id: sessionId },
      data: {
        uploadId: null,
        status: 'draft',
        updatedAt: new Date(),
      },
    });
  }
  
  // Utility methods
  async deleteSession(id: string): Promise<void> {
    await prisma.gamingSession.delete({
      where: { id },
    });
  }
  
  async getTotalSpeechTime(sessionId: string): Promise<number> {
    const result = await prisma.transcription.aggregate({
      where: { sessionId },
      _sum: {
        endTime: true,
        startTime: true,
      },
    });
    
    return (result._sum.endTime || 0) - (result._sum.startTime || 0);
  }
  
  async getSessionStats(userId?: string): Promise<{
    totalSessions: number;
    completedSessions: number;
    totalCampaigns: number;
  }> {
    const where = userId ? { campaign: { userId } } : undefined;
    const campaignWhere = userId ? { userId } : undefined;
    
    const [totalSessions, completedSessions, totalCampaigns] = await Promise.all([
      prisma.gamingSession.count({ where }),
      prisma.gamingSession.count({ where: { ...where, status: 'completed' } }),
      prisma.campaign.count({ where: campaignWhere }),
    ]);
    
    return {
      totalSessions,
      completedSessions,
      totalCampaigns,
    };
  }
}

// Create singleton instance
export const db = new DatabaseService();
export default db;