import type { FastifyInstance } from 'fastify';
import { generateRequestSchema } from '@qalynks/shared';
import type { AiGenerationService } from '../ai/generator';
import { ValidationError } from '../errors';

export function registerAiRoutes(app: FastifyInstance, service: AiGenerationService): void {
  app.get('/api/ai/status', async () => service.status());

  app.post('/api/ai/generate', async (req) => {
    const parsed = generateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || '_'] ??= issue.message;
      }
      throw new ValidationError('Validation failed', fields);
    }
    return service.generate(parsed.data.requirement);
  });
}
