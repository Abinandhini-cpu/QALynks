import { describe, expect, it } from 'vitest';
import {
  aiResponseSchema,
  bulkCreateSchema,
  duplicateCheckSchema,
  generateRequestSchema,
  listQuerySchema,
  normalizeText,
  testCaseInputSchema,
} from './index';

const valid = {
  title: '  Login works  ',
  description: '',
  preconditions: '',
  steps: [{ action: ' Open page ', expectedResult: '' }],
  expectedResult: '',
  priority: 'High',
  testType: 'Smoke',
  module: ' Auth ',
  tags: [' a '],
  status: 'Draft',
};

describe('normalizeText', () => {
  it('folds case, punctuation and whitespace', () => {
    expect(normalizeText('  Login -- Works!!  ')).toBe('login works');
  });
});

describe('testCaseInputSchema', () => {
  it('trims valid input', () => {
    const r = testCaseInputSchema.parse(valid);
    expect(r.title).toBe('Login works');
    expect(r.module).toBe('Auth');
    expect(r.tags).toEqual(['a']);
    expect(r.steps[0]?.action).toBe('Open page');
  });

  it('rejects blank title, bad enums, empty step action and bad tags', () => {
    const r = testCaseInputSchema.safeParse({
      ...valid,
      title: '   ',
      priority: 'Urgent',
      steps: [{ action: ' ', expectedResult: '' }],
      tags: ['a,b'],
    });
    expect(r.success).toBe(false);
    const paths = r.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['title', 'priority', 'steps.0.action', 'tags.0']),
    );
  });
});

describe('listQuerySchema', () => {
  it('applies defaults and coerces numbers', () => {
    const r = listQuerySchema.parse({ page: '2', pageSize: '10' });
    expect(r).toMatchObject({ page: 2, pageSize: 10, sort: 'updatedAt', order: 'desc' });
  });
  it('rejects oversized page size and unknown sort', () => {
    expect(listQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false);
    expect(listQuerySchema.safeParse({ sort: 'password' }).success).toBe(false);
  });
});

describe('duplicateCheckSchema', () => {
  it('requires a title', () => {
    expect(duplicateCheckSchema.safeParse({ title: ' ' }).success).toBe(false);
    expect(duplicateCheckSchema.parse({ title: 'x' }).module).toBe('');
  });
});

describe('AI and bulk schemas', () => {
  it('requires a non-trivial requirement and trims it', () => {
    expect(generateRequestSchema.safeParse({ requirement: 'short' }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ requirement: 'x'.repeat(20001) }).success).toBe(false);
    expect(
      generateRequestSchema.parse({ requirement: `  ${'a'.repeat(25)}  ` }).requirement,
    ).toHaveLength(25);
  });

  it('requires at least one test case in a bulk save', () => {
    expect(bulkCreateSchema.safeParse({ testCases: [] }).success).toBe(false);
    expect(bulkCreateSchema.safeParse({ testCases: [valid] }).success).toBe(true);
  });

  it('defaults test data and actual result to blank', () => {
    const parsed = testCaseInputSchema.parse(valid);
    expect(parsed.testData).toBe('');
    expect(parsed.actualResult).toBe('');
  });

  it('accepts a well-formed AI response and rejects a malformed one', () => {
    const analysis = {
      summary: 's',
      features: [],
      businessRules: [],
      acceptanceCriteria: [],
      validations: [],
      dependencies: [],
      errorScenarios: [],
      ambiguities: [],
      missingInformation: [],
      contradictions: [],
      assumptions: [],
    };
    expect(aiResponseSchema.safeParse({ analysis, testCases: [] }).success).toBe(true);
    expect(aiResponseSchema.safeParse({ analysis, testCases: [{ summary: 'x' }] }).success).toBe(
      false,
    );
  });
});
