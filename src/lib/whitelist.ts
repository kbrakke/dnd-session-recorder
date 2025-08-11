// Email whitelist configuration for staging environment
export const WHITELIST_CONFIG = {
  // Enable/disable whitelist based on environment
  enabled: process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'preview' || 
           process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging' ||
           process.env.WHITELIST_ENABLED === 'true',
  
  // Whitelisted email addresses
  allowedEmails: [
    'kbrakke@gmail.com',
    'user@test.com', 
    'admin@test.com'
  ],
  
  // Error messages
  messages: {
    accessDenied: 'Access denied. This account is not authorized to access the staging environment.',
    signupBlocked: 'Account creation is currently restricted. Please contact an administrator.',
    loginBlocked: 'This email address is not authorized to access the staging environment.'
  }
};

/**
 * Check if an email is whitelisted
 */
export function isEmailWhitelisted(email: string): boolean {
  if (!WHITELIST_CONFIG.enabled) {
    return true; // Whitelist disabled, allow all
  }
  
  if (!email) {
    return false;
  }
  
  return WHITELIST_CONFIG.allowedEmails.includes(email.toLowerCase().trim());
}

/**
 * Check if whitelist is currently enabled
 */
export function isWhitelistEnabled(): boolean {
  return WHITELIST_CONFIG.enabled;
}

/**
 * Get whitelist error message
 */
export function getWhitelistMessage(type: 'access' | 'signup' | 'login'): string {
  switch (type) {
    case 'signup':
      return WHITELIST_CONFIG.messages.signupBlocked;
    case 'login':
      return WHITELIST_CONFIG.messages.loginBlocked;
    default:
      return WHITELIST_CONFIG.messages.accessDenied;
  }
}