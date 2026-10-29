import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { fullCase, renderRoute } from '../test/utils';
import { TestCaseDetailPage } from './TestCaseDetailPage';

const renderDetail = (code = 'TC-0001') =>
  renderRoute(<TestCaseDetailPage />, { path: '/test-cases/:code', route: `/test-cases/${code}` });

afterEach(() => vi.restoreAllMocks());

describe('TestCaseDetailPage', () => {
  it('shows every field including ordered steps, tags and timestamps', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(fullCase());
    renderDetail();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Login works' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Happy path')).toBeInTheDocument();
    expect(screen.getByText('User exists')).toBeInTheDocument();
    const steps = screen.getAllByRole('listitem').filter((li) => li.closest('ol.steps'));
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent('Open page');
    expect(steps[0]).toHaveTextContent('Expected: Form shown');
    expect(steps[1]).not.toHaveTextContent('Expected');
    expect(screen.getByText('login')).toBeInTheDocument();
    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/test-cases/TC-0001/edit',
    );
  });

  it('shows placeholders for empty optional data', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      fullCase({ description: '', steps: [], tags: [], module: '' }),
    );
    renderDetail();
    expect(await screen.findByText('No steps added')).toBeInTheDocument();
    expect(screen.getAllByText('None').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Not provided')).toBeInTheDocument();
  });

  it('handles not found and load errors', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Test case not found'));
    const { unmount } = renderDetail('TC-0404');
    expect(await screen.findByText('TC-0404 does not exist or was deleted.')).toBeInTheDocument();
    unmount();

    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(500, 'INTERNAL', 'Something went wrong'));
    renderDetail();
    expect(
      await screen.findByText('Something went wrong', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('deletes only after confirmation and returns to the list', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(fullCase());
    const remove = vi.spyOn(api, 'remove').mockResolvedValue(undefined);
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete test case' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('TC-0001'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/test-cases'));
  });

  it('keeps the record and tells the user when deletion fails', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(fullCase());
    vi.spyOn(api, 'remove').mockRejectedValue(
      new ApiError(500, 'INTERNAL', 'Something went wrong'),
    );
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete test case' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('heading', { level: 1, name: 'Login works' })).toBeInTheDocument();
  });
});
