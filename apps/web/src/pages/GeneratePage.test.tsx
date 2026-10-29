import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedCase, GenerateResponse, RequirementAnalysis } from '@qalynks/shared';
import { ApiError, api } from '../api/client';
import { REVIEW_COLUMNS } from '../generation';
import { renderRoute } from '../test/utils';
import { GeneratePage } from './GeneratePage';

const REQUIREMENT =
  'As a user I can sign in with email and password. Wrong passwords show an error.';

const analysis = (over: Partial<RequirementAnalysis> = {}): RequirementAnalysis => ({
  summary: 'Sign-in feature with password validation',
  features: ['Sign in'],
  businessRules: ['Registered users can sign in'],
  acceptanceCriteria: [],
  validations: ['Password required'],
  dependencies: [],
  errorScenarios: ['Wrong password shows an error'],
  ambiguities: ['Lockout rule not stated'],
  missingInformation: ['No acceptance criteria'],
  contradictions: [],
  assumptions: ['Email is the username'],
  ...over,
});

const generated = (over: Partial<GeneratedCase> = {}): GeneratedCase => ({
  key: 'k1',
  module: 'Authentication',
  summary: 'Sign in with valid credentials',
  steps: ['Open the sign-in page', 'Enter credentials'],
  testData: 'Email: [Not specified: registered email]',
  expectedResult: 'The dashboard opens',
  actualResult: '',
  scenarioType: 'positive',
  priority: 'High',
  testType: 'Functional',
  sourceReference: 'Registered users can sign in',
  flags: {
    moduleNeedsReview: false,
    expectedResultNeedsClarification: false,
    clarificationNote: '',
    possibleDuplicateOf: [],
  },
  ...over,
});

const response = (
  cases: GeneratedCase[],
  over: Partial<GenerateResponse> = {},
): GenerateResponse => ({
  analysis: analysis(),
  testCases: cases,
  provider: 'fake',
  model: 'fake-model',
  ...over,
});

const THREE = [
  generated(),
  generated({ key: 'k2', summary: 'Reject a wrong password', scenarioType: 'negative' }),
  generated({
    key: 'k3',
    module: '',
    summary: 'Account lockout behaviour',
    expectedResult: 'To be confirmed',
    scenarioType: 'edge',
    flags: {
      moduleNeedsReview: true,
      expectedResultNeedsClarification: true,
      clarificationNote: 'No lockout rule is stated',
      possibleDuplicateOf: ['TC-0007'],
    },
  }),
];

const renderPage = () =>
  renderRoute(<GeneratePage />, { path: '/test-cases/generate', route: '/test-cases/generate' });

const configured = () =>
  vi
    .spyOn(api, 'aiStatus')
    .mockResolvedValue({ configured: true, provider: 'fake', model: 'fake-model', mock: false });

async function submitRequirement(text = REQUIREMENT) {
  const box = await screen.findByLabelText('Requirement text');
  await waitFor(() => expect(box).toBeEnabled());
  await userEvent.type(box, text);
  await userEvent.click(screen.getByRole('button', { name: 'Analyse and generate' }));
}

beforeEach(() => configured());
afterEach(() => vi.restoreAllMocks());

describe('availability', () => {
  it('explains when AI is not configured and disables input', async () => {
    vi.spyOn(api, 'aiStatus').mockResolvedValue({
      configured: false,
      provider: null,
      model: null,
      mock: false,
    });
    renderPage();
    expect(await screen.findByText('AI generation is not configured')).toBeInTheDocument();
    expect(
      screen.getByText('Manual test case creation is not affected.', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Requirement text')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Analyse and generate' })).toBeDisabled();
  });

  it('labels the test provider so it is not mistaken for AI output', async () => {
    vi.spyOn(api, 'aiStatus').mockResolvedValue({
      configured: true,
      provider: 'mock',
      model: 'canned-output',
      mock: true,
    });
    renderPage();
    expect(await screen.findByText('Test provider active')).toBeInTheDocument();
    expect(screen.getByText(/not generated from your requirement/)).toBeInTheDocument();
  });

  it('validates the requirement before calling the server', async () => {
    const generate = vi.spyOn(api, 'generate');
    renderPage();
    await submitRequirement('too short');
    expect(await screen.findByText(/Enter at least 20 characters/)).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('analysis and review', () => {
  it('shows progress, the analysis and the generated cases from one submission', async () => {
    let resolve!: (value: GenerateResponse) => void;
    const generate = vi.spyOn(api, 'generate').mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    await submitRequirement();
    expect(
      await screen.findByText(/Analysing the requirement and generating test cases/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analysing…' })).toBeDisabled();
    resolve(response(THREE));

    const panel = await screen.findByRole('region', { name: 'Requirement analysis' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(REQUIREMENT);
    expect(panel).toHaveTextContent('Sign-in feature with password validation');
    expect(panel).toHaveTextContent('Registered users can sign in');
    expect(panel).toHaveTextContent('Lockout rule not stated');
    expect(panel).toHaveTextContent('No acceptance criteria');
    expect(panel).toHaveTextContent('Assumptions (not confirmed requirements)');
    expect(panel).toHaveTextContent('Email is the username');
  });

  it('reports a clean analysis when nothing needs clarification', async () => {
    vi.spyOn(api, 'generate').mockResolvedValue(
      response([generated()], {
        analysis: analysis({
          ambiguities: [],
          missingInformation: [],
          assumptions: [],
          contradictions: [],
        }),
      }),
    );
    renderPage();
    await submitRequirement();
    expect(
      await screen.findByText(/found no ambiguities, gaps or contradictions/),
    ).toBeInTheDocument();
  });

  it('renders exactly the seven columns, in order', async () => {
    vi.spyOn(api, 'generate').mockResolvedValue(response(THREE));
    renderPage();
    await submitRequirement();
    const table = await screen.findByRole('table', { name: 'Generated test cases for review' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      'TC ID',
      'Module',
      'Summary',
      'Steps',
      'Test Data',
      'Expected Result',
      'Actual Result',
    ]);
    expect(headers).toEqual([...REVIEW_COLUMNS]);
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(within(row).getAllByRole('cell')).toHaveLength(7);
    }
  });

  it('shows each field, a pending ID and a blank Actual Result', async () => {
    vi.spyOn(api, 'generate').mockResolvedValue(response([generated()]));
    renderPage();
    await submitRequirement();
    const table = await screen.findByRole('table', { name: 'Generated test cases for review' });
    const cells = within(within(table).getAllByRole('row')[1]!).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Assigned on save');
    expect(cells[1]).toHaveTextContent('Authentication');
    expect(cells[2]).toHaveTextContent('Sign in with valid credentials');
    expect(
      within(cells[3]!)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Open the sign-in page', 'Enter credentials']);
    expect(cells[4]).toHaveTextContent('[Not specified: registered email]');
    expect(cells[5]).toHaveTextContent('The dashboard opens');
    expect(cells[6]).toHaveTextContent('Blank until executed');
  });

  it('flags a module needing review, unclear expected results and possible duplicates', async () => {
    vi.spyOn(api, 'generate').mockResolvedValue(response(THREE));
    renderPage();
    await submitRequirement();
    expect(await screen.findByText('Module needs review')).toBeInTheDocument();
    expect(screen.getByText('Needs clarification: No lockout rule is stated')).toBeInTheDocument();
    expect(screen.getByText('Possible duplicate of TC-0007')).toBeInTheDocument();
  });

  it('says so when no test cases could be generated', async () => {
    vi.spyOn(api, 'generate').mockResolvedValue(response([]));
    renderPage();
    await submitRequirement();
    expect(await screen.findByText(/No test cases could be generated/)).toBeInTheDocument();
  });
});

describe('approve, edit, remove and save', () => {
  const open = async (cases = THREE) => {
    vi.spyOn(api, 'generate').mockResolvedValue(response(cases));
    renderPage();
    await submitRequirement();
    await screen.findByRole('table', { name: 'Generated test cases for review' });
  };

  it('starts with nothing approved, so nothing can be saved by accident', async () => {
    await open();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 0 approved' })).toBeDisabled();
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
  });

  it('selects all and clears the selection', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('saves only the approved cases through the existing bulk create and lists the new IDs', async () => {
    await open();
    const createBulk = vi.spyOn(api, 'createBulk').mockResolvedValue({
      created: [
        { index: 0, code: 'TC-0011' },
        { index: 1, code: 'TC-0012' },
      ],
    });
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Approve: Sign in with valid credentials' }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Approve: Account lockout behaviour' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 approved' }));

    await waitFor(() => expect(createBulk).toHaveBeenCalledTimes(1));
    const sent = createBulk.mock.calls[0]![0];
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      title: 'Sign in with valid credentials',
      module: 'Authentication',
      steps: [
        { action: 'Open the sign-in page', expectedResult: '' },
        { action: 'Enter credentials', expectedResult: '' },
      ],
      testData: 'Email: [Not specified: registered email]',
      expectedResult: 'The dashboard opens',
      actualResult: '',
      tags: ['ai-generated', 'positive'],
      status: 'Draft',
    });
    expect(sent[1]?.title).toBe('Account lockout behaviour');
    expect(sent[1]?.description).toContain('Needs clarification: No lockout rule is stated');
    expect(sent.map((s) => s.title)).not.toContain('Reject a wrong password');

    const saved = await screen.findByRole('region', { name: 'Saved test cases' });
    expect(within(saved).getByRole('link', { name: 'TC-0011' })).toHaveAttribute(
      'href',
      '/test-cases/TC-0011',
    );
    expect(within(saved).getByRole('link', { name: 'TC-0012' })).toBeInTheDocument();
    expect(await screen.findByText('Saved 2 test cases')).toBeInTheDocument();

    const review = screen.getByRole('table', { name: 'Generated test cases for review' });
    expect(within(review).getAllByRole('row')).toHaveLength(2);
    expect(within(review).getByText('Reject a wrong password')).toBeInTheDocument();
  });

  it('keeps cases and shows the message when saving fails', async () => {
    await open();
    vi.spyOn(api, 'createBulk').mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', {
        'testCases.0.title': 'Title is required',
      }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Approve: Sign in with valid credentials' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 approved' }));
    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByText('testCases.0.title: Title is required')).toBeInTheDocument();
    expect(screen.getByText('Sign in with valid credentials')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Saved test cases' })).not.toBeInTheDocument();
  });

  it('removes a generated case from review', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Remove: Reject a wrong password' }));
    expect(screen.queryByText('Reject a wrong password')).not.toBeInTheDocument();
    expect(screen.getByText('Review generated test cases (2 remaining)')).toBeInTheDocument();
  });

  it('edits a case, validates the edit, and keeps Actual Result blank', async () => {
    await open([generated()]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit: Sign in with valid credentials' }),
    );
    const group = screen.getByRole('group', { name: 'Edit: Sign in with valid credentials' });

    await userEvent.clear(within(group).getByLabelText('Summary'));
    await userEvent.clear(within(group).getByLabelText(/^Steps/));
    await userEvent.click(within(group).getByRole('button', { name: 'Apply changes' }));
    expect(within(group).getByText('Summary is required')).toBeInTheDocument();
    expect(within(group).getByText('Add at least one step')).toBeInTheDocument();

    await userEvent.type(within(group).getByLabelText('Summary'), 'Sign in works');
    await userEvent.type(
      within(group).getByLabelText(/^Steps/),
      'Open page{Enter}  {Enter}Submit form',
    );
    await userEvent.clear(within(group).getByLabelText('Test Data'));
    await userEvent.selectOptions(within(group).getByLabelText('Priority'), 'Critical');
    expect(
      within(group).getByText('Actual Result stays blank until the test case is executed.'),
    ).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('button', { name: 'Apply changes' }));

    const table = screen.getByRole('table', { name: 'Generated test cases for review' });
    const cells = within(within(table).getAllByRole('row')[1]!).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('Sign in works');
    expect(cells[2]).toHaveTextContent('Critical');
    expect(
      within(cells[3]!)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Open page', 'Submit form']);
    expect(cells[4]).toHaveTextContent('[Not specified in the requirement]');
    expect(cells[6]).toHaveTextContent('Blank until executed');
  });

  it('cancels an edit without changing the case', async () => {
    await open([generated()]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit: Sign in with valid credentials' }),
    );
    await userEvent.type(screen.getByLabelText('Summary'), ' changed');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Sign in with valid credentials')).toBeInTheDocument();
    expect(screen.queryByText(/changed/)).not.toBeInTheDocument();
  });

  it('lets the reviewer resolve flags, and blocks saving while a case is being edited', async () => {
    await open([THREE[2]!]);
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Approve: Account lockout behaviour' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit: Account lockout behaviour' }));
    expect(screen.getByRole('button', { name: 'Save 1 approved' })).toBeDisabled();

    const group = screen.getByRole('group', { name: 'Edit: Account lockout behaviour' });
    await userEvent.type(within(group).getByLabelText('Module'), 'Authentication');
    await userEvent.clear(within(group).getByLabelText('Expected Result'));
    await userEvent.type(
      within(group).getByLabelText('Expected Result'),
      'Account locks after 5 failures',
    );
    await userEvent.click(
      within(group).getByRole('checkbox', { name: /confirmed the expected result/ }),
    );
    await userEvent.click(within(group).getByRole('button', { name: 'Apply changes' }));

    expect(screen.queryByText('Module needs review')).not.toBeInTheDocument();
    expect(screen.queryByText(/Needs clarification:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 1 approved' })).toBeEnabled();
  });
});

describe('errors', () => {
  it.each([
    ['AI_RATE_LIMITED', 429, 'Too many generation requests. Try again in 20 seconds.'],
    ['AI_TIMEOUT', 504, 'The AI provider took too long to respond.'],
    [
      'AI_INVALID_RESPONSE',
      502,
      'The AI returned a response that could not be used. Nothing was saved.',
    ],
    ['AI_PROVIDER_ERROR', 502, 'The AI provider is unavailable.'],
  ])('shows %s and keeps the requirement text', async (code, status, message) => {
    vi.spyOn(api, 'generate').mockRejectedValue(new ApiError(status, code, message));
    renderPage();
    await submitRequirement();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Requirement text')).toHaveValue(REQUIREMENT);
    expect(screen.queryByRole('region', { name: 'Requirement analysis' })).not.toBeInTheDocument();
    if (code === 'AI_RATE_LIMITED')
      expect(screen.getByText(/Your requirement text is kept/)).toBeInTheDocument();
  });

  it('allows trying again after a failure', async () => {
    const generate = vi
      .spyOn(api, 'generate')
      .mockRejectedValueOnce(
        new ApiError(502, 'AI_PROVIDER_ERROR', 'The AI provider is unavailable.'),
      )
      .mockResolvedValue(response([generated()]));
    renderPage();
    await submitRequirement();
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Analyse and generate' }));
    expect(await screen.findByRole('region', { name: 'Requirement analysis' })).toBeInTheDocument();
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
