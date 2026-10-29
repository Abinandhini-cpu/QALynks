import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { fullCase, renderRoute } from '../test/utils';
import { TestCaseFormPage } from './TestCaseFormPage';

const renderCreate = () =>
  renderRoute(<TestCaseFormPage mode="create" />, {
    path: '/test-cases/new',
    route: '/test-cases/new',
  });
const renderEdit = (code = 'TC-0001') =>
  renderRoute(<TestCaseFormPage mode="edit" />, {
    path: '/test-cases/:code/edit',
    route: `/test-cases/${code}/edit`,
  });

afterEach(() => vi.restoreAllMocks());

describe('create', () => {
  it('shows field-level validation errors on both client and does not call the server', async () => {
    const create = vi.spyOn(api, 'create');
    renderCreate();
    await userEvent.click(screen.getByRole('button', { name: 'Create test case' }));
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('There is 1 problem');
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('field-title-error')).toHaveTextContent('Title is required');
    expect(create).not.toHaveBeenCalled();
  });

  it('validates step actions', async () => {
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Has an empty step');
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create test case' }));
    expect((await screen.findAllByText('Step action is required')).length).toBeGreaterThan(0);
  });

  it('submits a complete test case and navigates to its details', async () => {
    vi.spyOn(api, 'checkDuplicates').mockResolvedValue({ duplicates: [] });
    const create = vi
      .spyOn(api, 'create')
      .mockResolvedValue({ testCase: fullCase({ code: 'TC-0042' }), duplicates: [] });
    renderCreate();

    await userEvent.type(screen.getByLabelText(/^Title/), '  Checkout works ');
    await userEvent.type(screen.getByLabelText('Description'), 'Desc');
    await userEvent.type(screen.getByLabelText('Module or component'), 'Checkout');
    await userEvent.type(screen.getByLabelText('Tags'), 'smoke,payment{Enter}extra');
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));
    await userEvent.type(screen.getByLabelText(/^Step 1 action/), 'Pay');
    await userEvent.type(screen.getByLabelText(/^Step 1 expected result/), 'Paid');
    await userEvent.selectOptions(screen.getByLabelText(/^Priority/), 'Critical');
    await userEvent.selectOptions(screen.getByLabelText(/^Test type/), 'Integration');
    await userEvent.selectOptions(screen.getByLabelText(/^Status/), 'Ready');
    await userEvent.click(screen.getByRole('button', { name: 'Create test case' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toEqual({
      title: 'Checkout works',
      description: 'Desc',
      preconditions: '',
      steps: [{ action: 'Pay', expectedResult: 'Paid' }],
      expectedResult: '',
      priority: 'Critical',
      testType: 'Integration',
      module: 'Checkout',
      tags: ['smoke', 'payment', 'extra'],
      status: 'Ready',
    });
    expect(await screen.findByText('Created TC-0042')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/test-cases/TC-0042');
  });

  it('warns about possible duplicates and only saves after confirmation', async () => {
    vi.spyOn(api, 'checkDuplicates').mockResolvedValue({
      duplicates: [
        { code: 'TC-0003', title: 'Checkout works', module: 'Checkout', sameModule: true },
      ],
    });
    const create = vi
      .spyOn(api, 'create')
      .mockResolvedValue({ testCase: fullCase({ code: 'TC-0009' }), duplicates: [] });
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Checkout works');
    await userEvent.click(screen.getByRole('button', { name: 'Create test case' }));

    expect(await screen.findByText('Possible duplicate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /TC-0003: Checkout works/ })).toBeInTheDocument();
    expect(screen.getByText('same module')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it('clears the duplicate warning when the title changes', async () => {
    vi.spyOn(api, 'checkDuplicates').mockResolvedValue({
      duplicates: [{ code: 'TC-0003', title: 'X', module: '', sameModule: false }],
    });
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^Title/), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Create test case' }));
    await screen.findByText('Possible duplicate');
    await userEvent.type(screen.getByLabelText(/^Title/), 'Y');
    expect(screen.queryByText('Possible duplicate')).not.toBeInTheDocument();
  });

  it('still saves when the advisory duplicate check fails', async () => {
    vi.spyOn(api, 'checkDuplicates').mockRejectedValue(new ApiError(0, 'NETWORK', 'down'));
    const create = vi
      .spyOn(api, 'create')
      .mockResolvedValue({ testCase: fullCase(), duplicates: [] });
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Anything');
    await userEvent.click(screen.getByRole('button', { name: 'Create test case' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
  });

  it('shows server-side field errors and failures', async () => {
    vi.spyOn(api, 'checkDuplicates').mockResolvedValue({ duplicates: [] });
    const create = vi
      .spyOn(api, 'create')
      .mockRejectedValueOnce(
        new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', { title: 'Title is taken' }),
      )
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Something went wrong'));
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^Title/), 'A title');
    await userEvent.click(screen.getByRole('button', { name: 'Create test case' }));
    expect(await screen.findAllByText('Title is taken')).not.toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Create test case' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect((await screen.findAllByText('Something went wrong')).length).toBeGreaterThan(0);
  });
});

describe('steps and tags', () => {
  it('adds, reorders and removes steps', async () => {
    renderCreate();
    const add = screen.getByRole('button', { name: 'Add step' });
    await userEvent.click(add);
    await userEvent.click(add);
    await userEvent.type(screen.getByLabelText(/^Step 1 action/), 'first');
    await userEvent.type(screen.getByLabelText(/^Step 2 action/), 'second');
    expect(screen.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(screen.getByLabelText(/^Step 1 action/)).toHaveValue('second');
    expect(screen.getByLabelText(/^Step 2 action/)).toHaveValue('first');
    await userEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(screen.getByLabelText(/^Step 1 action/)).toHaveValue('first');
    expect(screen.queryByLabelText(/^Step 2 action/)).not.toBeInTheDocument();
  });

  it('adds tags without duplicates and removes them', async () => {
    renderCreate();
    const tags = screen.getByLabelText('Tags');
    await userEvent.type(tags, 'API{Enter}api{Enter}ui,');
    expect(screen.getByRole('button', { name: 'Remove tag API' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove tag api' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag API' }));
    expect(screen.queryByRole('button', { name: 'Remove tag API' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove tag ui' })).toBeInTheDocument();
  });

  it('splits pasted text on commas and semicolons into separate tags', async () => {
    renderCreate();
    const tags = screen.getByLabelText('Tags');
    await userEvent.click(tags);
    await userEvent.paste('smoke, e2e;login ,');
    await userEvent.tab();
    for (const name of ['smoke', 'e2e', 'login']) {
      expect(screen.getByRole('button', { name: `Remove tag ${name}` })).toBeInTheDocument();
    }
  });
});

describe('edit', () => {
  it('loads existing values, saves changes and excludes itself from duplicate checks', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(fullCase());
    const dup = vi.spyOn(api, 'checkDuplicates').mockResolvedValue({ duplicates: [] });
    const update = vi.spyOn(api, 'update').mockResolvedValue(fullCase({ title: 'Renamed' }));
    renderEdit();

    const title = await screen.findByLabelText(/^Title/);
    expect(title).toHaveValue('Login works');
    expect(screen.getByLabelText(/^Step 1 action/)).toHaveValue('Open page');
    expect(screen.getByRole('button', { name: 'Remove tag login' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Priority/)).toHaveValue('High');

    await userEvent.clear(title);
    await userEvent.type(title, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('TC-0001', expect.objectContaining({ title: 'Renamed' })),
    );
    expect(dup).toHaveBeenCalledWith(expect.objectContaining({ excludeCode: 'TC-0001' }));
    expect(await screen.findByText('Saved changes to TC-0001')).toBeInTheDocument();
  });

  it('handles a missing test case', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Test case not found'));
    renderEdit('TC-0404');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('TC-0404 does not exist or was deleted.')).toBeInTheDocument();
  });

  it('shows a loading state first', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    renderEdit();
    expect(screen.getByText('Loading test case…')).toBeInTheDocument();
  });
});
