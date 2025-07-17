import dotenv from 'dotenv';

// Load environment-specific configuration
const env = process.env.NODE_ENV || 'development';
const envFile = `.env.${env}`;

// Load the appropriate environment file
dotenv.config({ path: envFile });

// Also load the default .env file as fallback
dotenv.config();

export interface DatabaseConfig {
  provider: 'sqlite' | 'postgresql' | 'mysql';
  url: string;
  shadowUrl?: string;
}

export const getDatabaseConfig = (): DatabaseConfig => {
  const configs: Record<string, DatabaseConfig> = {
    development: {
      provider: 'sqlite',
      url: process.env.DATABASE_URL || 'file:./data/dev.db',
      shadowUrl: process.env.SHADOW_DATABASE_URL || 'file:./data/dev_shadow.db'
    },
    staging: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/dnd_staging',
      shadowUrl: process.env.SHADOW_DATABASE_URL || 'postgresql://user:password@localhost:5432/dnd_staging_shadow'
    },
    production: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL || 'postgresql://user:password@prod-host:5432/dnd_prod',
      shadowUrl: process.env.SHADOW_DATABASE_URL || 'postgresql://user:password@prod-host:5432/dnd_prod_shadow'
    },
    test: {
      provider: 'sqlite',
      url: process.env.DATABASE_URL || 'file:./data/test.db',
      shadowUrl: process.env.SHADOW_DATABASE_URL || 'file:./data/test_shadow.db'
    }
  };

  const config = configs[env];
  
  if (!config) {
    throw new Error(`No database configuration found for environment: ${env}`);
  }

  return config;
};

export const getEnvironment = () => {
  return process.env.NODE_ENV || 'development';
};

export const isDevelopment = () => getEnvironment() === 'development';
export const isProduction = () => getEnvironment() === 'production';
export const isTest = () => getEnvironment() === 'test';