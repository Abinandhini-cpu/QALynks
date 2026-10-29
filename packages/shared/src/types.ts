import type { Priority, Status, TestType } from './constants';

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
  steps: TestStep[];
  expectedResult: string;
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
