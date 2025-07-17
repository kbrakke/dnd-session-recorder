import { Campaign, Session, Transcription, Summary } from '@prisma/client';
export interface CreateCampaignData {
    name: string;
    description?: string;
}
export interface CreateSessionData {
    campaignId: number;
    title: string;
    sessionDate: Date;
    audioFilePath?: string;
    duration?: number;
}
export interface SessionWithIncludes extends Session {
    campaign: {
        name: string;
    };
    transcriptions: Transcription[];
    summary: Summary | null;
}
export interface SessionListItem extends Session {
    campaign: {
        name: string;
    };
    _count: {
        transcriptions: number;
    };
    summary: {
        id: number;
    } | null;
}
export declare class DatabaseService {
    createCampaign(data: CreateCampaignData): Promise<Campaign>;
    getCampaigns(): Promise<(Campaign & {
        _count: {
            sessions: number;
        };
    })[]>;
    getCampaignById(id: string): Promise<Campaign | null>;
    createSession(data: CreateSessionData): Promise<Session>;
    getSessions(): Promise<SessionListItem[]>;
    getSessionById(id: number): Promise<SessionWithIncludes | null>;
    updateSessionStatus(id: number, status: string): Promise<Session>;
    setSessionError(id: number, step: string, message: string): Promise<Session>;
    clearSessionError(id: number): Promise<Session>;
    saveTranscriptions(sessionId: number, segments: { start: number; end: number; text: string; avg_logprob?: number }[]): Promise<void>;
    getTranscriptions(sessionId: number): Promise<Transcription[]>;
    getTranscriptionCount(sessionId: number): Promise<number>;
    saveSummary(sessionId: number, summaryText: string): Promise<Summary>;
    getSummary(sessionId: number): Promise<Summary | null>;
    deleteSession(id: number): Promise<void>;
    getTotalSpeechTime(sessionId: number): Promise<number>;
    getSessionStats(): Promise<{
        totalSessions: number;
        completedSessions: number;
        totalCampaigns: number;
    }>;
}
export declare const db: DatabaseService;
export default db;
//# sourceMappingURL=database.d.ts.map