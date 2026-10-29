export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export const TEST_TYPES = [
  'Functional',
  'Regression',
  'Smoke',
  'Integration',
  'UI',
  'Performance',
  'Security',
] as const;
export const STATUSES = ['Draft', 'Ready', 'Deprecated'] as const;

export type Priority = (typeof PRIORITIES)[number];
export type TestType = (typeof TEST_TYPES)[number];
export type Status = (typeof STATUSES)[number];

export const SORT_FIELDS = [
  'code',
  'title',
  'module',
  'priority',
  'testType',
  'status',
  'updatedAt',
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SCENARIO_TYPES = [
  'positive',
  'negative',
  'boundary',
  'edge',
  'validation',
  'business-rule',
  'error-handling',
] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const AI_TAG = 'ai-generated';

export const LIMITS = {
  requirementMin: 20,
  requirementMax: 20000,
  maxGeneratedCases: 60,
  maxBulkCreate: 100,
  title: 200,
  longText: 5000,
  stepText: 2000,
  module: 100,
  tag: 40,
  maxSteps: 50,
  maxTags: 20,
  maxPageSize: 100,
  maxImportRows: 1000,
  maxImportBytes: 1024 * 1024,
} as const;
