import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { listResponse, renderRoute, summary } from '../test/utils';
import { TestCaseListPage } from './TestCaseListPage';

const renderList = (route = '/test-cases') =>
  renderRoute(<TestCaseListPage />, { path: '/test-cases', route });

beforeEach(() => {
  vi.spyOn(api, 'modules').mockResolvedValue({ modules: ['Auth', 'Checkout'] });
});
afterEach(() => vi.restoreAllMocks());

describe('TestCaseListPage', () => {
  it('shows loading, then rows with counts and actions', async () => {
    vi.spyOn(api, 'list').mockResolvedValue(
      listResponse([summary(), summary({ code: 'TC-0002', title: 'Logout works', module: '' })], {
        total: 9,
        filteredTotal: 2,
      }),
    );
    renderList();
    expect(screen.getByRole('status')).toHaveTextContent('Loading test cases');
    expect(await screen.findByRole('link', { name: 'Login works' })).toHaveAttribute(
      'href',
      '/test-cases/TC-0001',
    );
    expect(screen.getByText('2 of 9 test cases')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit TC-0001' })).toHaveAttribute(
      'href',
      '/test-cases/TC-0001/edit',
    );
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/test-cases/export.csv'),
    );
  });

  it('shows an empty state when there are no test cases at all', async () => {
    vi.spyOn(api, 'list').mockResolvedValue(listResponse([]));
    renderList();
    expect(await screen.findByText('No test cases yet')).toBeInTheDocument();
  });

  it('shows a no-match state and clears search and filters', async () => {
    const list = vi
      .spyOn(api, 'list')
      .mockResolvedValue(listResponse([], { total: 5, filteredTotal: 0 }));
    renderList('/test-cases?q=zzz&priority=High');
    expect(await screen.findByText('No test cases match your search')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/test-cases$/));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.not.objectContaining({ q: expect.anything() })),
    );
    expect(screen.getByLabelText('Search by ID or title')).toHaveValue('');
  });

  it('shows an error state and retries', async () => {
    const list = vi
      .spyOn(api, 'list')
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Something went wrong'))
      .mockResolvedValue(listResponse([summary()]));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Login works' })).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('debounces search and sends it with the other params', async () => {
    const list = vi.spyOn(api, 'list').mockResolvedValue(listResponse([summary()]));
    renderList();
    await screen.findByRole('link', { name: 'Login works' });
    await userEvent.type(screen.getByLabelText('Search by ID or title'), 'login');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'login', page: 1 })),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('q=login');
    // Typing characters one by one must not have fired a request per keystroke.
    expect(list.mock.calls.filter(([p]) => p.q && p.q !== 'login')).toHaveLength(0);
  });

  it('filters, and resets to the first page', async () => {
    const list = vi
      .spyOn(api, 'list')
      .mockResolvedValue(listResponse([summary()], { filteredTotal: 45, total: 45 }));
    renderList('/test-cases?page=2');
    await screen.findByRole('link', { name: 'Login works' });
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'Critical');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'UI');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Draft');
    await userEvent.selectOptions(
      await screen
        .findByRole('option', { name: 'Checkout' })
        .then(() => screen.getByLabelText('Module')),
      'Checkout',
    );
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          priority: 'Critical',
          testType: 'UI',
          status: 'Draft',
          module: 'Checkout',
          page: 1,
        }),
      ),
    );
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'All');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ priority: expect.anything() }),
      ),
    );
  });

  it('sorts when a column header is clicked and toggles direction', async () => {
    const list = vi.spyOn(api, 'list').mockResolvedValue(listResponse([summary()]));
    renderList();
    await screen.findByRole('link', { name: 'Login works' });
    const titleHeader = screen.getByRole('columnheader', { name: /Title/ });
    await userEvent.click(within(titleHeader).getByRole('button'));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'title', order: 'asc' }),
      ),
    );
    expect(screen.getByRole('columnheader', { name: /Title/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await userEvent.click(
      within(screen.getByRole('columnheader', { name: /Title/ })).getByRole('button'),
    );
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'title', order: 'desc' }),
      ),
    );
  });

  it('paginates', async () => {
    const list = vi
      .spyOn(api, 'list')
      .mockResolvedValue(listResponse([summary()], { filteredTotal: 45, total: 45 }));
    renderList();
    await screen.findByText('Page 1 of 3');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
  });

  it('ignores invalid URL parameters instead of failing', async () => {
    vi.spyOn(api, 'list').mockResolvedValue(listResponse([summary()]));
    renderList('/test-cases?sort=bogus&page=-1');
    expect(await screen.findByRole('link', { name: 'Login works' })).toBeInTheDocument();
  });

  it('requires confirmation before deleting, and can be cancelled', async () => {
    vi.spyOn(api, 'list').mockResolvedValue(listResponse([summary()]));
    const remove = vi.spyOn(api, 'remove').mockResolvedValue(undefined);
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete TC-0001' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Login works');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete TC-0001' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete test case' }),
    );
    await waitFor(() => expect(remove).toHaveBeenCalledWith('TC-0001'));
    expect(await screen.findByText('Deleted TC-0001')).toBeInTheDocument();
  });

  it('reports a failed delete without losing the row', async () => {
    vi.spyOn(api, 'list').mockResolvedValue(listResponse([summary()]));
    vi.spyOn(api, 'remove').mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Test case not found'),
    );
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete TC-0001' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete test case' }),
    );
    expect(await screen.findByText('Test case not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login works' })).toBeInTheDocument();
  });
});
