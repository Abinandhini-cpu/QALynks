import type {
  ApiErrorBody,
  CreateTestCaseResponse,
  DuplicateMatch,
  ImportResult,
  SummaryResponse,
  TestCase,
  TestCaseInput,
  TestCaseListResponse,
} from '@qalynks/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the QALynks server. Check that it is running.');
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const error = (body as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed (${response.status})`,
      error?.fields,
    );
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export interface ListParams {
  q?: string;
  priority?: string;
  testType?: string;
  status?: string;
  module?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

export function toQueryString(params: ListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  list: (params: ListParams) =>
    request<TestCaseListResponse>(`/api/test-cases${toQueryString(params)}`),
  get: (code: string) => request<TestCase>(`/api/test-cases/${encodeURIComponent(code)}`),
  create: (input: TestCaseInput) =>
    request<CreateTestCaseResponse>('/api/test-cases', json('POST', input)),
  update: (code: string, input: TestCaseInput) =>
    request<TestCase>(`/api/test-cases/${encodeURIComponent(code)}`, json('PUT', input)),
  remove: (code: string) =>
    request<void>(`/api/test-cases/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  checkDuplicates: (body: { title: string; module: string; excludeCode?: string }) =>
    request<{ duplicates: DuplicateMatch[] }>('/api/test-cases/duplicates', json('POST', body)),
  modules: () => request<{ modules: string[] }>('/api/modules'),
  summary: () => request<SummaryResponse>('/api/summary'),
  importCsv: (csv: string) =>
    request<ImportResult>('/api/test-cases/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csv,
    }),
  exportUrl: (params: ListParams) => {
    const { page: _page, pageSize: _pageSize, ...rest } = params;
    return `/api/test-cases/export.csv${toQueryString(rest)}`;
  },
};
