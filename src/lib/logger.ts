/**
 * Structured logging utility with OpenTelemetry-compatible format
 *
 * Logs are structured JSON with trace context for easy searching and debugging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
  uploadId?: string;
  campaignId?: string;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private serviceName = 'dnd-session-recorder';
  private environment = process.env.NODE_ENV || 'development';

  private generateTraceId(): string {
    // Generate a simple trace ID (in production, use actual OTEL trace context)
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context: { ...context, service: this.serviceName, environment: this.environment } }),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          ...(this.environment === 'development' && { stack: error.stack }),
        },
      }),
    };

    return JSON.stringify(entry);
  }

  debug(message: string, context?: LogContext): void {
    if (this.environment === 'development') {
      console.debug(this.formatLog('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatLog('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatLog('warn', message, context));
  }

  error(message: string, error?: Error, context?: LogContext): void {
    console.error(this.formatLog('error', message, context, error));
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
