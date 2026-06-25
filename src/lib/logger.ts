/**
 * Structured logging utility using Pino
 *
 * Provides trace, debug, info, warn, and error levels with structured JSON logging
 * Optimized for Elasticsearch ingestion via Fly.io
 */

import pino from 'pino';

export interface LogContext {
  [key: string]: unknown;
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
  uploadId?: string;
  campaignId?: string;
  httpMethod?: string;
  httpPath?: string;
  httpStatus?: number;
}

// Configure Pino for structured JSON logging
// Perfect for Elasticsearch ingestion - no pretty printing needed
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  base: {
    service: 'dnd-session-recorder',
    environment: process.env.NODE_ENV || 'development',
  },
  // Ensure proper timestamp format for Elasticsearch
  timestamp: pino.stdTimeFunctions.isoTime,
  // Format error objects properly for Elasticsearch
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

class Logger {
  trace(message: string, context?: LogContext): void {
    pinoLogger.trace(context, message);
  }

  debug(message: string, context?: LogContext): void {
    pinoLogger.debug(context, message);
  }

  info(message: string, context?: LogContext): void {
    pinoLogger.info(context, message);
  }

  warn(message: string, context?: LogContext): void {
    pinoLogger.warn(context, message);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (error) {
      pinoLogger.error({ ...context, err: error }, message);
    } else {
      pinoLogger.error(context, message);
    }
  }

  // API-specific helpers
  apiRequest(method: string, path: string, context?: LogContext): void {
    this.info(`API ${method} ${path}`, {
      ...context,
      httpMethod: method,
      httpPath: path,
    });
  }

  apiError(method: string, path: string, error: Error, context?: LogContext): void {
    this.error(`API ${method} ${path} failed`, error, {
      ...context,
      httpMethod: method,
      httpPath: path,
    });
  }

  apiSuccess(method: string, path: string, statusCode: number, context?: LogContext): void {
    this.info(`API ${method} ${path} ${statusCode}`, {
      ...context,
      httpMethod: method,
      httpPath: path,
      httpStatus: statusCode,
    });
  }
}

export const logger = new Logger();

// Helper to extract user context from NextAuth session
export function getUserContext(session: { user?: { id?: string; email?: string | null } } | null) {
  if (!session?.user) return {};
  return {
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
  };
}
