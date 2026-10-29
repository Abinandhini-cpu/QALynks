import { z } from 'zod';
import { LIMITS, PRIORITIES, SCENARIO_TYPES, SORT_FIELDS, STATUSES, TEST_TYPES } from './constants';

const text = (max: number) =>
  z
    .string()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((v) => v.trim());

export const stepSchema = z.object({
  action: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, 'Step action is required')
        .max(LIMITS.stepText, `Must be ${LIMITS.stepText} characters or fewer`),
    ),
  expectedResult: text(LIMITS.stepText),
});

export const tagSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .min(1, 'Tag cannot be empty')
      .max(LIMITS.tag, `Tags must be ${LIMITS.tag} characters or fewer`)
      .refine((v) => !/[,;]/.test(v), 'Tags cannot contain commas or semicolons'),
  );

export const testCaseInputSchema = z.object({
  title: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, 'Title is required')
        .max(LIMITS.title, `Title must be ${LIMITS.title} characters or fewer`),
    ),
  description: text(LIMITS.longText),
  preconditions: text(LIMITS.longText),
  testData: text(LIMITS.longText).default(''),
  steps: z
    .array(stepSchema)
    .max(LIMITS.maxSteps, `A test case can have at most ${LIMITS.maxSteps} steps`),
  expectedResult: text(LIMITS.longText),
  actualResult: text(LIMITS.longText).default(''),
  priority: z.enum(PRIORITIES, { error: 'Select a priority' }),
  testType: z.enum(TEST_TYPES, { error: 'Select a test type' }),
  module: text(LIMITS.module),
  tags: z
    .array(tagSchema)
    .max(LIMITS.maxTags, `A test case can have at most ${LIMITS.maxTags} tags`),
  status: z.enum(STATUSES, { error: 'Select a status' }),
});

export type TestCaseInput = z.infer<typeof testCaseInputSchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  priority: z.enum(PRIORITIES).optional(),
  testType: z.enum(TEST_TYPES).optional(),
  status: z.enum(STATUSES).optional(),
  module: z.string().trim().max(LIMITS.module).optional(),
  sort: z.enum(SORT_FIELDS).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const duplicateCheckSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(LIMITS.title),
  module: z.string().trim().max(LIMITS.module).default(''),
  excludeCode: z.string().optional(),
});

export type DuplicateCheckInput = z.infer<typeof duplicateCheckSchema>;

export const TEST_CASE_CODE_PATTERN = /^TC-\d{4,}$/;

export const bulkCreateSchema = z.object({
  testCases: z
    .array(testCaseInputSchema)
    .min(1, 'Select at least one test case')
    .max(LIMITS.maxBulkCreate, `At most ${LIMITS.maxBulkCreate} test cases can be saved at once`),
});

export type BulkCreateInput = z.infer<typeof bulkCreateSchema>;

export const generateRequestSchema = z.object({
  requirement: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(
          LIMITS.requirementMin,
          `Enter at least ${LIMITS.requirementMin} characters of requirement text`,
        )
        .max(
          LIMITS.requirementMax,
          `Requirement text must be ${LIMITS.requirementMax} characters or fewer`,
        ),
    ),
});

/**
 * Structure the AI model must return. Plain types only (no transforms) so it
 * can be converted to a JSON Schema for provider tool or structured-output calls.
 */
export const aiAnalysisSchema = z.object({
  summary: z.string(),
  features: z.array(z.string()),
  businessRules: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  validations: z.array(z.string()),
  dependencies: z.array(z.string()),
  errorScenarios: z.array(z.string()),
  ambiguities: z.array(z.string()),
  missingInformation: z.array(z.string()),
  contradictions: z.array(z.string()),
  assumptions: z.array(z.string()),
});

export const aiTestCaseSchema = z.object({
  module: z.string(),
  summary: z.string(),
  steps: z.array(z.string()).min(1),
  testData: z.string(),
  expectedResult: z.string(),
  scenarioType: z.enum(SCENARIO_TYPES),
  priority: z.enum(PRIORITIES),
  testType: z.enum(TEST_TYPES),
  needsClarification: z.boolean(),
  clarificationNote: z.string(),
  sourceReference: z.string(),
});

export const aiResponseSchema = z.object({
  analysis: aiAnalysisSchema,
  testCases: z.array(aiTestCaseSchema).max(LIMITS.maxGeneratedCases),
});

export type AiResponse = z.infer<typeof aiResponseSchema>;
