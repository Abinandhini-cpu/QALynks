import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  LIMITS,
  aiResponseSchema,
  normalizeText,
  type AiStatus,
  type GenerateResponse,
  type GeneratedCase,
} from '@qalynks/shared';
import type { TestCaseRepository } from '../repositories/testCaseRepository';
import { AiInvalidResponseError, AiNotConfiguredError, AiRateLimitedError } from './errors';
import type { LlmProvider } from './provider';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt';
import type { RateLimiter } from './rateLimiter';

const UNSPECIFIED_TEST_DATA = '[Not specified in the requirement]';
const MODULE_REVIEW_NOTE = 'Module could not be determined from the requirement';

function clip(value: string, max: number): string {
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function toJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(aiResponseSchema) as Record<
    string,
    unknown
  >;
  return schema;
}

/** Runs analysis and generation in a single provider call and normalises the result. */
export class AiGenerationService {
  constructor(
    private readonly provider: LlmProvider | null,
    private readonly repo: TestCaseRepository,
    private readonly limiter: RateLimiter,
  ) {}

  status(): AiStatus {
    return {
      configured: this.provider !== null,
      provider: this.provider?.name ?? null,
      model: this.provider?.model ?? null,
      mock: this.provider?.mock === true,
    };
  }

  async generate(requirement: string): Promise<GenerateResponse> {
    if (!this.provider) throw new AiNotConfiguredError();
    const wait = this.limiter.take();
    if (wait > 0) throw new AiRateLimitedError(wait, 'Local generation rate limit');

    const raw = await this.provider.generateStructured({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(requirement),
      schemaName: 'submit_analysis_and_test_cases',
      schemaDescription: 'Submit the requirement analysis and the generated test cases.',
      jsonSchema: toJsonSchema(),
      maxOutputTokens: 16000,
    });

    const parsed = aiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new AiInvalidResponseError(
        `Schema validation failed at ${first?.path.join('.') || 'root'}: ${first?.message ?? 'unknown'}`,
      );
    }

    return {
      analysis: parsed.data.analysis,
      testCases: this.normalise(parsed.data.testCases),
      provider: this.provider.name,
      model: this.provider.model,
    };
  }

  private normalise(items: z.infer<typeof aiResponseSchema>['testCases']): GeneratedCase[] {
    const seen = new Set<string>();
    const result: GeneratedCase[] = [];

    for (const item of items) {
      const summary = clip(item.summary, LIMITS.title);
      const steps = item.steps.map((s) => clip(s, LIMITS.stepText)).filter(Boolean);
      const expectedResult = clip(item.expectedResult, LIMITS.longText);
      if (!summary || steps.length === 0 || !expectedResult) continue;

      const module = clip(item.module, LIMITS.module);
      const key = `${normalizeText(summary)}|${normalizeText(module)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const moduleNeedsReview = module === '' || /^(unknown|n\/a|tbd|none)$/i.test(module);
      const note = item.needsClarification
        ? clip(item.clarificationNote, 500) || 'Expected result is not defined by the requirement'
        : '';

      result.push({
        key: randomUUID(),
        module: moduleNeedsReview ? '' : module,
        summary,
        steps: steps.slice(0, LIMITS.maxSteps),
        testData: clip(item.testData, LIMITS.longText) || UNSPECIFIED_TEST_DATA,
        expectedResult,
        // Generated cases have not been executed, whatever the model returned.
        actualResult: '',
        scenarioType: item.scenarioType,
        priority: item.priority,
        testType: item.testType,
        sourceReference: clip(item.sourceReference, 300),
        flags: {
          moduleNeedsReview,
          expectedResultNeedsClarification: item.needsClarification,
          clarificationNote: moduleNeedsReview
            ? [note, MODULE_REVIEW_NOTE].filter(Boolean).join('. ')
            : note,
          possibleDuplicateOf: this.repo
            .findDuplicates(summary, moduleNeedsReview ? '' : module)
            .map((d) => d.code),
        },
      });
    }
    return result;
  }
}
