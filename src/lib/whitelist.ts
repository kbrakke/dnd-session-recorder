// Parse whitelist from environment variable
// Format: comma-separated email addresses
// Example: "user1@example.com,user2@example.com"
function getStagingWhitelist(): string[] {
  const whitelistEnv = process.env.STAGING_WHITELIST || process.env.NEXT_PUBLIC_STAGING_WHITELIST;

  if (!whitelistEnv) {
    console.warn('[Whitelist] STAGING_WHITELIST environment variable not set, defaulting to empty whitelist');
    return [];
  }

  return whitelistEnv
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
}

const WHITELIST_ERROR_MESSAGES = {
  signup: 'Account creation is currently restricted. Please contact support for access.',
  login: 'Access is currently restricted. Please contact support if you believe this is an error.'
} as const;

export function isWhitelistEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' &&
         (process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging' || process.env.ENVIRONMENT === 'staging');
}

export function isEmailWhitelisted(email: string): boolean {
  if (!isWhitelistEnabled()) {
    return true;
  }

  if (!email) {
    return false;
  }

  const whitelist = getStagingWhitelist();
  const normalizedEmail = email.toLowerCase();

  return whitelist.includes(normalizedEmail) ||
         email.includes('@test.com') ||
         email.includes('@example.com');
}

export function getWhitelistMessage(context: 'signup' | 'login'): string {
  return WHITELIST_ERROR_MESSAGES[context];
}

export function validateWhitelistAccess(email: string): { allowed: boolean; message?: string } {
  if (!isWhitelistEnabled()) {
    return { allowed: true };
  }

  if (isEmailWhitelisted(email)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message: getWhitelistMessage('signup')
  };
}

/**
 * Check if an email is a test/example account that should not make real API calls
 * @param email - The email address to check
 * @returns true if this is a test account
 */
export function isTestAccount(email: string): boolean {
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
}