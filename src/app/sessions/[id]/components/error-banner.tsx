'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorBannerProps {
  error: string;
  errorStep?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export function ErrorBanner({
  error,
  errorStep,
  onRetry,
  isRetrying,
  className,
}: ErrorBannerProps) {
  return (
    <div
      className={cn('border-b', className)}
      style={{
        background: 'var(--sp-bg-sunken)',
        borderColor: 'var(--sp-error-bd)',
      }}
    >
      <div className="px-6 py-3">
        <div className="flex items-start gap-3">
          <AlertCircle
            className="h-5 w-5 flex-shrink-0 mt-0.5"
            style={{ color: 'var(--sp-error-fg-soft)' }}
          />
          <div className="flex-1">
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--sp-error-fg-soft)' }}
            >
              {errorStep?.includes('timeout')
                ? 'Processing timeout'
                : `Error during ${errorStep || 'processing'}`}
            </p>
            <p
              className="text-sm mt-1 opacity-80"
              style={{ color: 'var(--sp-error-fg-soft)' }}
            >
              {error}
            </p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="px-3 py-1.5 text-sm font-semibold rounded-[4px] disabled:opacity-50 flex items-center gap-2"
              style={{
                background: 'var(--sp-primary)',
                color: 'var(--sp-on-primary)',
                border: '1px solid var(--sp-primary-border)',
                boxShadow: 'var(--sp-shadow-btn)',
              }}
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
