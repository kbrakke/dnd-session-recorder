export interface TestUser {
  name: string;
  email: string;
  password: string;
  role?: string;
}

export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => ({
  name: 'Test User',
  email: `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
  password: 'TestPass123!',
  role: 'user',
  ...overrides,
});

export const createUniqueTestUser = (prefix = 'test', overrides: Partial<TestUser> = {}): TestUser => ({
  name: `${prefix} User`,
  email: `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
  password: 'TestPass123!',
  role: 'user',
  ...overrides,
});

export const TEST_USERS = {
  admin: { 
    name: 'Admin User',
    email: 'admin@test.com', 
    password: 'AdminPass123!', 
    role: 'admin' 
  },
  user: { 
    name: 'Regular User',
    email: 'user@test.com', 
    password: 'UserPass123!', 
    role: 'user' 
  },
  blocked: { 
    name: 'Blocked User',
    email: 'blocked@test.com', 
    password: 'BlockedPass123!', 
    role: 'user' 
  },
  whitelisted: {
    name: 'Whitelisted User',
    email: 'kbrakke@gmail.com',
    password: 'WhitelistPass123!',
    role: 'user'
  },
  unauthorized: {
    name: 'Unauthorized User',
    email: 'unauthorized@example.com',
    password: 'UnauthorizedPass123!',
    role: 'user'
  }
} as const;

export const createTestUserBatch = (count: number, prefix = 'batch'): TestUser[] => {
  return Array.from({ length: count }, (_, i) => 
    createUniqueTestUser(`${prefix}-${i}`)
  );
};

export const isTestEmail = (email: string): boolean => {
  return email.includes('@test.com') || 
         email.includes('@example.com') || 
         email.startsWith('test-') ||
         email.startsWith('apitest-') ||
         email.startsWith('batch-');
};