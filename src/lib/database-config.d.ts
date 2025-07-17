export interface DatabaseConfig {
    provider: 'sqlite' | 'postgresql' | 'mysql';
    url: string;
    shadowUrl?: string;
}
export declare const getDatabaseConfig: () => DatabaseConfig;
export declare const getEnvironment: () => string;
export declare const isDevelopment: () => boolean;
export declare const isProduction: () => boolean;
export declare const isTest: () => boolean;
//# sourceMappingURL=database-config.d.ts.map