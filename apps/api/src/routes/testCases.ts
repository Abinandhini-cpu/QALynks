import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import {
  duplicateCheckSchema,
  LIMITS,
  listQuerySchema,
  TEST_CASE_CODE_PATTERN,
  testCaseInputSchema,
} from '@qalynks/shared';
import { NotFoundError, ValidationError } from '../errors';
import type { TestCaseService } from '../services/testCaseService';

function parseWith<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    fields[key] ??= issue.message;
  }
  throw new ValidationError('Validation failed', fields);
}

function parseCode(params: unknown): string {
  const code = (params as { code?: string }).code ?? '';
  if (!TEST_CASE_CODE_PATTERN.test(code)) throw new NotFoundError();
  return code;
}

export function registerTestCaseRoutes(app: FastifyInstance, service: TestCaseService): void {
  app.addContentTypeParser(
    'text/csv',
    { parseAs: 'string', bodyLimit: LIMITS.maxImportBytes },
    (_req, body, done) => done(null, body),
  );

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/summary', async () => service.summary());
  app.get('/api/modules', async () => ({ modules: service.modules() }));

  app.get('/api/test-cases', async (req) => service.list(parseWith(listQuerySchema, req.query)));

  app.get('/api/test-cases/export.csv', async (req, reply) => {
    const query = parseWith(listQuerySchema, req.query);
    const csv = service.exportCsv(query, query);
    const date = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="qalynks-test-cases-${date}.csv"`)
      .send(csv);
  });

  app.post('/api/test-cases/import', { bodyLimit: LIMITS.maxImportBytes }, async (req) => {
    if (typeof req.body !== 'string') {
      throw new ValidationError('Send the CSV file contents with Content-Type: text/csv');
    }
    return service.importCsv(req.body);
  });

  app.post('/api/test-cases/duplicates', async (req) => ({
    duplicates: service.checkDuplicates(parseWith(duplicateCheckSchema, req.body)),
  }));

  app.post('/api/test-cases', async (req, reply) => {
    const created = service.create(parseWith(testCaseInputSchema, req.body));
    return reply.code(201).send(created);
  });

  app.get('/api/test-cases/:code', async (req) => service.get(parseCode(req.params)));

  app.put('/api/test-cases/:code', async (req) =>
    service.update(parseCode(req.params), parseWith(testCaseInputSchema, req.body)),
  );

  app.delete('/api/test-cases/:code', async (req, reply) => {
    service.remove(parseCode(req.params));
    return reply.code(204).send();
  });
}
