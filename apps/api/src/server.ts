import { createProvider } from './ai/factory';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/connection';
import { runMigrations } from './db/migrate';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // No .env file; defaults apply.
}

const config = loadConfig();
const db = openDatabase(config.databasePath);
runMigrations(db, config.migrationsDir);

const aiProvider = createProvider(config.ai, config.production);
const app = buildApp({
  db,
  logLevel: config.logLevel,
  aiProvider,
  aiMaxRequestsPerMinute: config.ai.maxRequestsPerMinute,
});

app.log.info(
  aiProvider
    ? `AI generation enabled: provider=${aiProvider.name} model=${aiProvider.model}`
    : 'AI generation disabled: no provider configured',
);

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
