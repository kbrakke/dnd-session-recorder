"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const createPrismaClient = () => {
    return new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
    });
};
exports.prisma = globalThis.prisma || createPrismaClient();
// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
    globalThis.prisma = exports.prisma;
}
// Handle graceful shutdown
process.on('beforeExit', async () => {
    await exports.prisma.$disconnect();
});
exports.default = exports.prisma;
//# sourceMappingURL=prisma.js.map