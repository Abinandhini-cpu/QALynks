import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { TestCase, TestCaseListResponse, TestCaseSummary } from '@qalynks/shared';
import { ToastProvider } from '../components/Toast';

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="location">{`${loc.pathname}${loc.search}`}</span>;
}

export function renderRoute(ui: ReactElement, opts: { path: string; route: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[opts.route]}>
          <Routes>
            <Route path={opts.path} element={ui} />
            <Route path="*" element={<p>Other route</p>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

export const summary = (over: Partial<TestCaseSummary> = {}): TestCaseSummary => ({
  code: 'TC-0001',
  title: 'Login works',
  module: 'Auth',
  priority: 'High',
  testType: 'Smoke',
  status: 'Ready',
  updatedAt: '2026-03-05T10:00:00.000Z',
  ...over,
});

export const listResponse = (
  items: TestCaseSummary[],
  over: Partial<TestCaseListResponse> = {},
): TestCaseListResponse => ({
  items,
  total: items.length,
  filteredTotal: items.length,
  page: 1,
  pageSize: 20,
  ...over,
});

export const fullCase = (over: Partial<TestCase> = {}): TestCase => ({
  code: 'TC-0001',
  title: 'Login works',
  description: 'Happy path',
  preconditions: 'User exists',
  testData: 'Email: user@example.test',
  actualResult: '',
  steps: [
    { position: 1, action: 'Open page', expectedResult: 'Form shown' },
    { position: 2, action: 'Submit', expectedResult: '' },
  ],
  expectedResult: 'Signed in',
  priority: 'High',
  testType: 'Smoke',
  module: 'Auth',
  tags: ['login'],
  status: 'Ready',
  revision: 3,
  createdAt: '2026-03-01T09:00:00.000Z',
  updatedAt: '2026-03-05T10:00:00.000Z',
  ...over,
});
