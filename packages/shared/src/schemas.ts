import { z } from 'zod';
import { LIMITS, PRIORITIES, SORT_FIELDS, STATUSES, TEST_TYPES } from './constants';

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
  steps: z
    .array(stepSchema)
    .max(LIMITS.maxSteps, `A test case can have at most ${LIMITS.maxSteps} steps`),
  expectedResult: text(LIMITS.longText),
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
