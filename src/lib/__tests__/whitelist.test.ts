import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  isWhitelistEnabled,
  isEmailWhitelisted,
  validateWhitelistAccess,
  getWhitelistMessage,
  isTestAccount,
} from '@/lib/whitelist';

function setStaging(opts: { whitelist?: string; viaPublic?: boolean } = {}) {
  vi.stubEnv('NODE_ENV', 'development');
  if (opts.viaPublic ?? true) {
    vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT', 'staging');
  } else {
    vi.stubEnv('ENVIRONMENT', 'staging');
  }
  if (opts.whitelist !== undefined) {
    vi.stubEnv('STAGING_WHITELIST', opts.whitelist);
  }
}

describe('whitelist', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isWhitelistEnabled', () => {
    it('is false in production regardless of staging env vars', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT', 'staging');
      expect(isWhitelistEnabled()).toBe(false);
    });

    it('is false in development without a staging marker', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT', '');
      vi.stubEnv('ENVIRONMENT', '');
      expect(isWhitelistEnabled()).toBe(false);
    });

    it('is true when NEXT_PUBLIC_ENVIRONMENT=staging', () => {
      setStaging({ viaPublic: true });
      expect(isWhitelistEnabled()).toBe(true);
    });

    it('is true when ENVIRONMENT=staging', () => {
      setStaging({ viaPublic: false });
      expect(isWhitelistEnabled()).toBe(true);
    });
  });

  describe('isEmailWhitelisted', () => {
    it('returns true for any email when whitelist is disabled', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(isEmailWhitelisted('anyone@gmail.com')).toBe(true);
    });

    it('returns false for empty input when whitelist is enabled', () => {
      setStaging({ whitelist: 'kbrakke@gmail.com' });
      expect(isEmailWhitelisted('')).toBe(false);
    });

    it('matches emails in STAGING_WHITELIST case-insensitively', () => {
      setStaging({ whitelist: 'kbrakke@gmail.com,allowed@company.com' });
      expect(isEmailWhitelisted('kbrakke@gmail.com')).toBe(true);
      expect(isEmailWhitelisted('KBRAKKE@gmail.com')).toBe(true);
      expect(isEmailWhitelisted('ALLOWED@COMPANY.COM')).toBe(true);
    });

    it('always allows @test.com and @example.com regardless of STAGING_WHITELIST', () => {
      setStaging({ whitelist: '' });
      expect(isEmailWhitelisted('anyone@test.com')).toBe(true);
      expect(isEmailWhitelisted('anyone@example.com')).toBe(true);
    });

    it('rejects emails outside the whitelist and test domains', () => {
      setStaging({ whitelist: 'kbrakke@gmail.com' });
      expect(isEmailWhitelisted('stranger@gmail.com')).toBe(false);
      expect(isEmailWhitelisted('someone@yahoo.com')).toBe(false);
    });

    it('trims whitespace and skips empty entries in STAGING_WHITELIST', () => {
      setStaging({ whitelist: '  kbrakke@gmail.com  , , allowed@company.com ' });
      expect(isEmailWhitelisted('kbrakke@gmail.com')).toBe(true);
      expect(isEmailWhitelisted('allowed@company.com')).toBe(true);
    });
  });

  describe('getWhitelistMessage', () => {
    it('returns the signup-context message', () => {
      expect(getWhitelistMessage('signup')).toMatch(/Account creation is currently restricted/);
    });

    it('returns the login-context message', () => {
      expect(getWhitelistMessage('login')).toMatch(/Access is currently restricted/);
    });
  });

  describe('validateWhitelistAccess', () => {
    it('allows access when whitelist is disabled', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const result = validateWhitelistAccess('stranger@gmail.com');
      expect(result.allowed).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('allows whitelisted emails', () => {
      setStaging({ whitelist: 'kbrakke@gmail.com' });
      expect(validateWhitelistAccess('kbrakke@gmail.com')).toEqual({ allowed: true });
    });

    it('denies non-whitelisted emails with the signup message', () => {
      setStaging({ whitelist: 'kbrakke@gmail.com' });
      const result = validateWhitelistAccess('stranger@gmail.com');
      expect(result.allowed).toBe(false);
      expect(result.message).toMatch(/Account creation is currently restricted/);
    });
  });

  describe('isTestAccount', () => {
    it('returns false for empty input', () => {
      expect(isTestAccount('')).toBe(false);
    });

    it.each([
      'user@test.com',
      'admin@example.com',
      'someone@example.org',
      'test@gmail.com',
      'testuser@gmail.com',
      'demo@yahoo.com',
      'demouser@yahoo.com',
      'user+test@gmail.com',
      'user+demo@gmail.com',
      'TEST@gmail.com',
      'User@TEST.com',
    ])('detects %s as a test account', (email) => {
      expect(isTestAccount(email)).toBe(true);
    });

    it.each([
      'john@gmail.com',
      'kbrakke@gmail.com',
      'admin@organization.org',
      'user@latest.com',
      'user@contest.org',
    ])('does not flag %s as a test account', (email) => {
      expect(isTestAccount(email)).toBe(false);
    });
  });
});
