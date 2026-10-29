import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '@qalynks/shared';
import type { Db } from './db/connection';
import { AppError } from './errors';
import { TestCaseRepository } from './repositories/testCaseRepository';
import { registerTestCaseRoutes } from './routes/testCases';
import { TestCaseService } from './services/testCaseService';

export interface AppOptions {
  db: Db;
  logLevel?: string;
  clock?: () => Date;
}

export function buildApp({ db, logLevel = 'silent', clock }: AppOptions): FastifyInstance {
  const app = Fastify({ logger: logLevel === 'silent' ? false : { level: logLevel } });

  void app.register(helmet);

  const service = new TestCaseService(new TestCaseRepository(db), db, clock);
  registerTestCaseRoutes(app, service);

  app.setNotFoundHandler((_req, reply) => {
    const body: ApiErrorBody = { error: { code: 'NOT_FOUND', message: 'Route not found' } };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
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
