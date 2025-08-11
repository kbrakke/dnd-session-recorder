const STAGING_WHITELIST = [
  'kbrakke@gmail.com',
  'admin@test.com',
  'user@test.com'
];

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
  
  return STAGING_WHITELIST.includes(email.toLowerCase())
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