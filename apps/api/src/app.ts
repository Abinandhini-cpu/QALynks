import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '@qalynks/shared';
import { AiError } from './ai/errors';
import { AiGenerationService } from './ai/generator';
import type { LlmProvider } from './ai/provider';
import { RateLimiter } from './ai/rateLimiter';
import type { Db } from './db/connection';
import { AppError } from './errors';
import { TestCaseRepository } from './repositories/testCaseRepository';
import { registerAiRoutes } from './routes/ai';
import { registerTestCaseRoutes } from './routes/testCases';
import { TestCaseService } from './services/testCaseService';

export interface AppOptions {
  db: Db;
  logLevel?: string;
  clock?: () => Date;
  /** Null or omitted means AI generation is not configured. */
  aiProvider?: LlmProvider | null;
  aiMaxRequestsPerMinute?: number;
}

export function buildApp({
  db,
  logLevel = 'silent',
  clock,
  aiProvider = null,
  aiMaxRequestsPerMinute = 10,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger: logLevel === 'silent' ? false : { level: logLevel } });

  void app.register(helmet);

  const repo = new TestCaseRepository(db);
  const service = new TestCaseService(repo, db, clock);
  registerTestCaseRoutes(app, service);
  registerAiRoutes(
    app,
    new AiGenerationService(aiProvider, repo, new RateLimiter(aiMaxRequestsPerMinute, 60_000)),
  );

  app.setNotFoundHandler((_req, reply) => {
    const body: ApiErrorBody = { error: { code: 'NOT_FOUND', message: 'Route not found' } };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof AiError) {
      if (err.detail) req.log.warn({ code: err.code, detail: err.detail }, 'AI request failed');
      if (err.retryAfterSeconds) reply.header('Retry-After', String(err.retryAfterSeconds));
    }
    if (err instanceof AppError) {
      const body: ApiErrorBody = {
        error: { code: err.code, message: err.message, fields: err.fields },
      };
      return reply.code(err.statusCode).send(body);
    }
    const status = err.statusCode;
    if (status && status >= 400 && status < 500) {
      const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
      const message = status === 413 ? 'The request body is too large' : 'The request was invalid';
      return reply.code(status).send({ error: { code, message } } satisfies ApiErrorBody);
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.code(500).send({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    } satisfies ApiErrorBody);
  });

  return app;
}
