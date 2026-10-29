import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportResult, SummaryResponse } from '@qalynks/shared';
import { ApiError, api } from '../api/client';
import { App } from '../App';
import { ToastProvider, useToast } from '../components/Toast';
import { Pagination } from '../components/Pagination';
import { renderRoute, summary } from '../test/utils';
import { DashboardPage } from './DashboardPage';
import { ImportPage } from './ImportPage';

afterEach(() => vi.restoreAllMocks());

const csvFile = (name = 'cases.csv', body = 'title\nx') =>
  new File([body], name, { type: 'text/csv' });
const renderImport = () =>
  renderRoute(<ImportPage />, { path: '/test-cases/import', route: '/test-cases/import' });

describe('ImportPage', () => {
  it('uploads a CSV and reports created, skipped and failed rows', async () => {
    const result: ImportResult = {
      totalRows: 4,
      created: [{ row: 2, code: 'TC-0001' }],
      skippedDuplicates: [{ row: 3, title: 'Dup', duplicateOf: 'TC-0001' }],
      failed: [
        { row: 4, errors: { title: 'Title is required', _row: 'Row has more values' } },
        { row: 5, errors: { priority: 'Select a priority' } },
      ],
    };
    const importCsv = vi.spyOn(api, 'importCsv').mockResolvedValue(result);
    renderImport();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    await userEvent.upload(
      screen.getByLabelText(/CSV file/),
      csvFile('cases.csv', 'title,priority\nA,High'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(importCsv).toHaveBeenCalledWith('title,priority\nA,High'));
    const region = await screen.findByRole('region', { name: 'Import results' });
    expect(region).toHaveTextContent('1 created');
    expect(region).toHaveTextContent('1 skipped as duplicates');
    expect(region).toHaveTextContent('2 failed');
    expect(region).toHaveTextContent('Row 3: “Dup” matches TC-0001');
    expect(region).toHaveTextContent('title: Title is required');
    expect(region).toHaveTextContent('row: Row has more values');
  });

  it('shows the server message when the whole file is rejected', async () => {
    vi.spyOn(api, 'importCsv').mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Missing required column(s): status'),
    );
    renderImport();
    await userEvent.upload(screen.getByLabelText(/CSV file/), csvFile());
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Missing required column(s): status')).toBeInTheDocument();
  });

  it('rejects wrong file types and oversized files before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderImport();
    const input = screen.getByLabelText(/CSV file/);
    await user.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText('Choose a .csv file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();

    const big = new File(['x'], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 2 * 1024 * 1024 });
    await user.upload(input, big);
    expect(await screen.findByText(/larger than 1 MB/)).toBeInTheDocument();
  });

  it('offers a downloadable template', () => {
    renderImport();
    expect(screen.getByRole('link', { name: 'Download template' })).toHaveAttribute(
      'href',
      expect.stringContaining('data:text/csv'),
    );
  });
});

describe('DashboardPage', () => {
  const data: SummaryResponse = {
    total: 3,
    byStatus: { Draft: 1, Ready: 2, Deprecated: 0 },
    byPriority: { Critical: 1, High: 1, Medium: 1, Low: 0 },
    byType: {
      Functional: 3,
      Regression: 0,
      Smoke: 0,
      Integration: 0,
      UI: 0,
      Performance: 0,
      Security: 0,
    },
    recent: [summary()],
  };

  it('shows totals, distributions and recent cases', async () => {
    vi.spyOn(api, 'summary').mockResolvedValue(data);
    renderRoute(<DashboardPage />, { path: '/', route: '/' });
    expect(await screen.findByText('Total test cases')).toBeInTheDocument();
    expect(screen.getByText('By priority')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login works' })).toHaveAttribute(
      'href',
      '/test-cases/TC-0001',
    );
  });

  it('shows an empty state with next steps', async () => {
    vi.spyOn(api, 'summary').mockResolvedValue({ ...data, total: 0, recent: [] });
    renderRoute(<DashboardPage />, { path: '/', route: '/' });
    expect(await screen.findByText('Start your test library')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import CSV' })).toBeInTheDocument();
  });

  it('shows errors with retry', async () => {
    const spy = vi
      .spyOn(api, 'summary')
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Something went wrong'))
      .mockResolvedValue(data);
    renderRoute(<DashboardPage />, { path: '/', route: '/' });
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Total test cases')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('application shell', () => {
  const renderApp = (route: string) => {
    vi.spyOn(api, 'summary').mockResolvedValue({
      total: 0,
      byStatus: { Draft: 0, Ready: 0, Deprecated: 0 },
      byPriority: { Critical: 0, High: 0, Medium: 0, Low: 0 },
      byType: {
        Functional: 0,
        Regression: 0,
        Smoke: 0,
        Integration: 0,
        UI: 0,
        Performance: 0,
        Security: 0,
      },
      recent: [],
    });
    return render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  };

  it('brands the app, marks the active module and lists planned modules as unavailable', async () => {
    renderApp('/');
    expect(screen.getAllByText('QALynks').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    for (const name of [
      'Requirements',
      'Bug Management',
      'Test Execution',
      'Reports',
      'Settings',
    ]) {
      const item = screen.getByText(name, { exact: false });
      expect(item.closest('[aria-disabled="true"]')).not.toBeNull();
    }
    expect(screen.queryByRole('link', { name: /Requirements/ })).not.toBeInTheDocument();
  });

  it('toggles the mobile menu and closes it with Escape', async () => {
    renderApp('/');
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders a not-found page for unknown routes', () => {
    renderApp('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('Pagination and Toast', () => {
  it('disables Next on the last page and reports ranges', async () => {
    const onPage = vi.fn();
    render(<Pagination page={2} pageSize={20} total={25} onPage={onPage} />);
    expect(screen.getByText('21–25 of 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('shows 0–0 for empty results', () => {
    render(<Pagination page={1} pageSize={20} total={0} onPage={() => undefined} />);
    expect(screen.getByText('0–0 of 0')).toBeInTheDocument();
  });

  it('shows and dismisses toasts', async () => {
    function Trigger() {
      const { notify } = useToast();
      return <button onClick={() => notify('error', 'Boom')}>go</button>;
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('go'));
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('throws a helpful error when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Bad() {
      useToast();
      return null;
    }
    expect(() => render(<Bad />)).toThrow('useToast must be used inside ToastProvider');
    spy.mockRestore();
  });
});
