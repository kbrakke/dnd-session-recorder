"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.DatabaseService = void 0;
const prisma_1 = require("../lib/prisma");
class DatabaseService {
    // Campaign operations
    async createCampaign(data) {
        return prisma_1.prisma.campaign.create({
            data: {
                name: data.name,
                description: data.description,
            },
        });
    }
    async getCampaigns() {
        return prisma_1.prisma.campaign.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { sessions: true },
                },
            },
        });
    }
    async getCampaignById(id) {
        return prisma_1.prisma.campaign.findUnique({
            where: { id },
        });
    }
    // Session operations
    async createSession(data) {
        return prisma_1.prisma.session.create({
            data: {
                campaignId: data.campaignId,
                title: data.title,
                sessionDate: data.sessionDate,
                audioFilePath: data.audioFilePath,
                duration: data.duration,
                status: 'pending',
            },
        });
    }
    async getSessions() {
        return prisma_1.prisma.session.findMany({
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
    async getSessionById(id) {
        return prisma_1.prisma.session.findUnique({
            where: { id },
            include: {
                campaign: {
                    select: { name: true },
                },
                transcriptions: {
                    orderBy: { startTime: 'asc' },
                },
                summary: true,
            },
        });
    }
    async updateSession(id, data) {
        return prisma_1.prisma.session.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
        });
    }
    async updateSessionStatus(id, status) {
        return prisma_1.prisma.session.update({
            where: { id },
            data: {
                status,
                updatedAt: new Date(),
            },
        });
    }
    async setSessionError(id, step, message) {
        return prisma_1.prisma.session.update({
            where: { id },
            data: {
                errorStep: step,
                errorMessage: message,
                status: 'error',
                updatedAt: new Date(),
            },
        });
    }
    async clearSessionError(id) {
        return prisma_1.prisma.session.update({
            where: { id },
            data: {
                errorStep: null,
                errorMessage: null,
                updatedAt: new Date(),
            },
        });
    }
    // Transcription operations
    async saveTranscriptions(sessionId, segments) {
        await prisma_1.prisma.$transaction(async (tx) => {
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
    async getTranscriptions(sessionId) {
        return prisma_1.prisma.transcription.findMany({
            where: { sessionId },
            orderBy: { startTime: 'asc' },
        });
    }
    async getTranscriptionCount(sessionId) {
        return prisma_1.prisma.transcription.count({
            where: { sessionId },
        });
    }
    // Summary operations
    async saveSummary(sessionId, summaryText) {
        return prisma_1.prisma.summary.upsert({
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
    async getSummary(sessionId) {
        return prisma_1.prisma.summary.findUnique({
            where: { sessionId },
        });
    }
    // Utility methods
    async deleteSession(id) {
        await prisma_1.prisma.session.delete({
            where: { id },
        });
    }
    async getTotalSpeechTime(sessionId) {
        const result = await prisma_1.prisma.transcription.aggregate({
            where: { sessionId },
            _sum: {
                endTime: true,
                startTime: true,
            },
        });
        return (result._sum.endTime || 0) - (result._sum.startTime || 0);
    }
    async getSessionStats() {
        const [totalSessions, completedSessions, totalCampaigns] = await Promise.all([
            prisma_1.prisma.session.count(),
            prisma_1.prisma.session.count({ where: { status: 'completed' } }),
            prisma_1.prisma.campaign.count(),
        ]);
        return {
            totalSessions,
            completedSessions,
            totalCampaigns,
        };
    }
}
exports.DatabaseService = DatabaseService;
// Create singleton instance
exports.db = new DatabaseService();
exports.default = exports.db;
//# sourceMappingURL=database.js.map