import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface AiConfig {
  /** 'anthropic', 'mock' (tests only) or 'none'. */
  provider: string;
  apiKey: string | undefined;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRequestsPerMinute: number;
}

export interface Config {
  port: number;
  host: string;
  databasePath: string;
  logLevel: string;
  migrationsDir: string;
  production: boolean;
  ai: AiConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databasePath = env.DATABASE_PATH ?? 'data/qalynks.db';
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '127.0.0.1',
    databasePath: databasePath === ':memory:' ? databasePath : path.resolve(apiRoot, databasePath),
    logLevel: env.LOG_LEVEL ?? 'info',
    migrationsDir: path.join(apiRoot, 'migrations'),
    production: env.NODE_ENV === 'production',
    ai: {
      provider: env.AI_PROVIDER?.trim().toLowerCase() || (apiKey ? 'anthropic' : 'none'),
      apiKey,
      model: env.AI_MODEL?.trim() || 'claude-sonnet-5-5',
      baseUrl: (env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com').replace(/\/+$/, ''),
      timeoutMs: Number(env.AI_TIMEOUT_MS ?? 120000),
      maxRequestsPerMinute: Number(env.AI_MAX_REQUESTS_PER_MINUTE ?? 10),
    },
  };
}
