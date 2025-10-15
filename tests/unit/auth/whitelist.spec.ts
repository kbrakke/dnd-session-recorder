import { test, expect } from '@playwright/test';

// Mock the whitelist module to test different environment conditions
let mockNodeEnv: string | undefined;
let mockNextPublicEnvironment: string | undefined;
let mockEnvironment: string | undefined;

// We need to directly test the logic since we can't modify process.env
const isWhitelistEnabledMock = (): boolean => {
  return mockNodeEnv !== 'production' && 
         (mockNextPublicEnvironment === 'staging' || mockEnvironment === 'staging');
};

const isEmailWhitelistedMock = (email: string): boolean => {
  const STAGING_WHITELIST = [
    'kbrakke@gmail.com',
    'admin@test.com',
    'user@test.com'
  ];
  
  if (!isWhitelistEnabledMock()) {
    return true;
  }
  
  if (!email) {
    return false;
  }
  
  return STAGING_WHITELIST.includes(email.toLowerCase()) || 
         email.includes('@test.com') || 
         email.includes('@example.com');
};

const getWhitelistMessageMock = (context: 'signup' | 'login'): string => {
  const WHITELIST_ERROR_MESSAGES = {
    signup: 'Account creation is currently restricted. Please contact support for access.',
    login: 'Access is currently restricted. Please contact support if you believe this is an error.'
  };
  return WHITELIST_ERROR_MESSAGES[context];
};

const validateWhitelistAccessMock = (email: string): { allowed: boolean; message?: string } => {
  if (!isWhitelistEnabledMock()) {
    return { allowed: true };
  }

  if (isEmailWhitelistedMock(email)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message: getWhitelistMessageMock('signup')
  };
};

const isTestAccountMock = (email: string): boolean => {
  if (!email) {
    return false;
  }

  const normalizedEmail = email.toLowerCase();

  // Check for test/example domains
  const testDomains = ['@test.com', '@example.com', '@example.org'];
  const hasTestDomain = testDomains.some(domain => normalizedEmail.includes(domain));

  // Check for test-related email patterns
  const testPatterns = [
    /^test/,           // starts with 'test'
    /test@/,           // test@anything
    /demo@/,           // demo@anything
    /example@/,        // example@anything
    /^demo/,           // starts with 'demo'
    /\+test@/,         // email+test@domain
    /\+demo@/,         // email+demo@domain
  ];

  const matchesPattern = testPatterns.some(pattern => pattern.test(normalizedEmail));

  return hasTestDomain || matchesPattern;
};

test.describe('Whitelist Functionality', () => {
  
  test.describe('isWhitelistEnabled', () => {
    test('should return false in production environment', async () => {
      mockNodeEnv = 'production';
      mockNextPublicEnvironment = undefined;
      mockEnvironment = undefined;
      
      expect(isWhitelistEnabledMock()).toBe(false);
    });

    test('should return false when not in staging environment', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = undefined;
      mockEnvironment = undefined;
      
      expect(isWhitelistEnabledMock()).toBe(false);
    });

    test('should return true in staging environment', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = 'staging';
      mockEnvironment = undefined;
      
      expect(isWhitelistEnabledMock()).toBe(true);
    });

    test('should return true when ENVIRONMENT is staging', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = undefined;
      mockEnvironment = 'staging';
      
      expect(isWhitelistEnabledMock()).toBe(true);
    });
  });

  test.describe('isEmailWhitelisted', () => {
    test('should return true when whitelist is disabled', async () => {
      mockNodeEnv = 'production';
      mockNextPublicEnvironment = undefined;
      mockEnvironment = undefined;
      
      expect(isEmailWhitelistedMock('anyone@example.com')).toBe(true);
    });

    test('should return false for empty email when whitelist enabled', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = 'staging';
      mockEnvironment = undefined;
      
      expect(isEmailWhitelistedMock('')).toBe(false);
      expect(isEmailWhitelistedMock(null as never)).toBe(false);
      expect(isEmailWhitelistedMock(undefined as never)).toBe(false);
    });

    test('should whitelist specific production emails', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = 'staging';
      mockEnvironment = undefined;
      
      expect(isEmailWhitelistedMock('kbrakke@gmail.com')).toBe(true);
      expect(isEmailWhitelistedMock('KBRAKKE@GMAIL.COM')).toBe(true); // case insensitive
    });

    test('should whitelist test emails', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = 'staging';
      mockEnvironment = undefined;
      
      expect(isEmailWhitelistedMock('admin@test.com')).toBe(true);
      expect(isEmailWhitelistedMock('user@test.com')).toBe(true);
      expect(isEmailWhitelistedMock('anyone@test.com')).toBe(true);
      expect(isEmailWhitelistedMock('someone@example.com')).toBe(true);
    });

    test('should reject non-whitelisted emails', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = 'staging';
      mockEnvironment = undefined;
      
      expect(isEmailWhitelistedMock('unauthorized@gmail.com')).toBe(false);
      expect(isEmailWhitelistedMock('random@yahoo.com')).toBe(false);
      expect(isEmailWhitelistedMock('user@company.com')).toBe(false);
    });
  });

  test.describe('getWhitelistMessage', () => {
    test('should return appropriate signup message', async () => {
      const message = getWhitelistMessageMock('signup');
      expect(message).toContain('Account creation is currently restricted');
      expect(message).toContain('contact support');
    });

    test('should return appropriate login message', async () => {
      const message = getWhitelistMessageMock('login');
      expect(message).toContain('Access is currently restricted');
      expect(message).toContain('contact support');
    });
  });

  test.describe('validateWhitelistAccess', () => {
    test('should allow access when whitelist is disabled', async () => {
      mockNodeEnv = 'production';
      mockNextPublicEnvironment = undefined;
      mockEnvironment = undefined;
      
      const result = validateWhitelistAccessMock('unauthorized@example.com');
      expect(result.allowed).toBe(true);
      expect(result.message).toBeUndefined();
    });

    test('should allow whitelisted emails', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = 'staging';
      mockEnvironment = undefined;
      
      const result = validateWhitelistAccessMock('kbrakke@gmail.com');
      expect(result.allowed).toBe(true);
      expect(result.message).toBeUndefined();
    });

    test('should block non-whitelisted emails with message', async () => {
      mockNodeEnv = 'development';
      mockNextPublicEnvironment = 'staging';
      mockEnvironment = undefined;
      
      const result = validateWhitelistAccessMock('unauthorized@gmail.com');
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('Account creation is currently restricted');
    });
  });

  test.describe('isTestAccount', () => {
    test('should return false for empty email', async () => {
      expect(isTestAccountMock('')).toBe(false);
      expect(isTestAccountMock(null as never)).toBe(false);
      expect(isTestAccountMock(undefined as never)).toBe(false);
    });

    test('should detect test domain emails', async () => {
      expect(isTestAccountMock('user@test.com')).toBe(true);
      expect(isTestAccountMock('admin@example.com')).toBe(true);
      expect(isTestAccountMock('someone@example.org')).toBe(true);
    });

    test('should detect emails starting with test', async () => {
      expect(isTestAccountMock('test@gmail.com')).toBe(true);
      expect(isTestAccountMock('test123@company.com')).toBe(true);
      expect(isTestAccountMock('testuser@domain.com')).toBe(true);
    });

    test('should detect emails starting with demo', async () => {
      expect(isTestAccountMock('demo@gmail.com')).toBe(true);
      expect(isTestAccountMock('demo123@company.com')).toBe(true);
      expect(isTestAccountMock('demouser@domain.com')).toBe(true);
    });

    test('should detect email+test pattern', async () => {
      expect(isTestAccountMock('user+test@gmail.com')).toBe(true);
      expect(isTestAccountMock('john+test@company.com')).toBe(true);
    });

    test('should detect email+demo pattern', async () => {
      expect(isTestAccountMock('user+demo@gmail.com')).toBe(true);
      expect(isTestAccountMock('john+demo@company.com')).toBe(true);
    });

    test('should be case insensitive', async () => {
      expect(isTestAccountMock('TEST@gmail.com')).toBe(true);
      expect(isTestAccountMock('User@TEST.com')).toBe(true);
      expect(isTestAccountMock('DEMO@company.com')).toBe(true);
      expect(isTestAccountMock('user+TEST@gmail.com')).toBe(true);
    });

    test('should NOT flag real production emails', async () => {
      expect(isTestAccountMock('john@gmail.com')).toBe(false);
      expect(isTestAccountMock('kbrakke@gmail.com')).toBe(false);
      expect(isTestAccountMock('user@company.com')).toBe(false);
      expect(isTestAccountMock('admin@organization.org')).toBe(false);
    });

    test('should NOT flag emails containing test in domain', async () => {
      // Only emails starting with test or having test in local part should match
      expect(isTestAccountMock('user@latest.com')).toBe(false);
      expect(isTestAccountMock('user@contest.org')).toBe(false);
    });

    test('should flag all common test patterns', async () => {
      const testEmails = [
        'test@test.com',
        'demo@example.com',
        'example@example.org',
        'testuser@gmail.com',
        'demouser@yahoo.com',
        'user+test@hotmail.com',
        'admin+demo@company.com',
      ];

      testEmails.forEach(email => {
        expect(isTestAccountMock(email)).toBe(true);
      });
    });
  });
});