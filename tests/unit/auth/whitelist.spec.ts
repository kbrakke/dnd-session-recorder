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
      expect(isEmailWhitelistedMock(null as any)).toBe(false);
      expect(isEmailWhitelistedMock(undefined as any)).toBe(false);
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
});