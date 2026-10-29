import type { Priority, ScenarioType, Status, TestType } from './constants';

export interface TestStep {
  position: number;
  action: string;
  expectedResult: string;
}

export interface TestCase {
  code: string;
  title: string;
  description: string;
  preconditions: string;
  testData: string;
  steps: TestStep[];
  expectedResult: string;
  /** Filled in during execution. Blank for new test cases. */
  actualResult: string;
  priority: Priority;
  testType: TestType;
  module: string;
  tags: string[];
  status: Status;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseSummary {
  code: string;
  title: string;
  module: string;
  priority: Priority;
  testType: TestType;
  status: Status;
  updatedAt: string;
}

export interface TestCaseListResponse {
  items: TestCaseSummary[];
  /** All active test cases, ignoring filters. */
  total: number;
  /** Test cases matching the current search and filters. */
  filteredTotal: number;
  page: number;
  pageSize: number;
}

export interface DuplicateMatch {
  code: string;
  title: string;
  module: string;
  /** True when the module also matches, which makes a duplicate more likely. */
  sameModule: boolean;
}

export interface CreateTestCaseResponse {
  testCase: TestCase;
  duplicates: DuplicateMatch[];
}

export interface ImportResult {
  totalRows: number;
  created: { row: number; code: string }[];
  skippedDuplicates: { row: number; title: string; duplicateOf: string }[];
  failed: { row: number; errors: Record<string, string> }[];
}

export interface SummaryResponse {
  total: number;
  byStatus: Record<Status, number>;
  byPriority: Record<Priority, number>;
  byType: Record<TestType, number>;
  recent: TestCaseSummary[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface RequirementAnalysis {
  summary: string;
  features: string[];
  businessRules: string[];
  acceptanceCriteria: string[];
  validations: string[];
  dependencies: string[];
  errorScenarios: string[];
  ambiguities: string[];
  missingInformation: string[];
  contradictions: string[];
  assumptions: string[];
}

/**
 * A generated test case in the seven-column review format:
 * TC ID (assigned on save), Module, Summary, Steps, Test Data,
 * Expected Result and Actual Result (always blank). The remaining fields are
 * review metadata, not columns.
 */
export interface GeneratedCase {
  key: string;
  module: string;
  summary: string;
  steps: string[];
  testData: string;
  expectedResult: string;
  actualResult: string;
  scenarioType: ScenarioType;
  priority: Priority;
  testType: TestType;
  sourceReference: string;
  flags: {
    moduleNeedsReview: boolean;
    expectedResultNeedsClarification: boolean;
    clarificationNote: string;
    possibleDuplicateOf: string[];
  };
}

export interface GenerateResponse {
  analysis: RequirementAnalysis;
  testCases: GeneratedCase[];
  provider: string;
  model: string;
}

export interface AiStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  /** True for the built-in test provider, which returns canned output and is not AI. */
  mock: boolean;
}

export interface BulkCreateResponse {
  created: { index: number; code: string }[];
}
