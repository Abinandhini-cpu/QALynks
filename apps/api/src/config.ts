import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface Config {
  port: number;
  host: string;
  databasePath: string;
  logLevel: string;
  migrationsDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databasePath = env.DATABASE_PATH ?? 'data/qalynks.db';
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '127.0.0.1',
    databasePath: databasePath === ':memory:' ? databasePath : path.resolve(apiRoot, databasePath),
    logLevel: env.LOG_LEVEL ?? 'info',
    migrationsDir: path.join(apiRoot, 'migrations'),
  };
}
