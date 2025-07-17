"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTest = exports.isProduction = exports.isDevelopment = exports.getEnvironment = exports.getDatabaseConfig = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment-specific configuration
const env = process.env.NODE_ENV || 'development';
const envFile = `.env.${env}`;
// Load the appropriate environment file
dotenv_1.default.config({ path: envFile });
// Also load the default .env file as fallback
dotenv_1.default.config();
const getDatabaseConfig = () => {
    const configs = {
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
exports.getDatabaseConfig = getDatabaseConfig;
const getEnvironment = () => {
    return process.env.NODE_ENV || 'development';
};
exports.getEnvironment = getEnvironment;
const isDevelopment = () => (0, exports.getEnvironment)() === 'development';
exports.isDevelopment = isDevelopment;
const isProduction = () => (0, exports.getEnvironment)() === 'production';
exports.isProduction = isProduction;
const isTest = () => (0, exports.getEnvironment)() === 'test';
exports.isTest = isTest;
//# sourceMappingURL=database-config.js.map