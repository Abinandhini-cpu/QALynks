import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  generateRequestSchema,
  LIMITS,
  PRIORITIES,
  TEST_TYPES,
  type GeneratedCase,
  type GenerateResponse,
  type RequirementAnalysis,
} from '@qalynks/shared';
import { ApiError, api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks';
import { REVIEW_COLUMNS, splitLines, toTestCaseInput, validateGenerated } from '../generation';

interface Row {
  data: GeneratedCase;
  selected: boolean;
  editing: boolean;
}

interface SavedRow {
  code: string;
  data: GeneratedCase;
}

const ANALYSIS_LISTS: { key: keyof RequirementAnalysis; label: string }[] = [
  { key: 'features', label: 'Features' },
  { key: 'businessRules', label: 'Business rules' },
  { key: 'acceptanceCriteria', label: 'Acceptance criteria' },
  { key: 'validations', label: 'Validations' },
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'errorScenarios', label: 'Error scenarios' },
];

const ATTENTION_LISTS: { key: keyof RequirementAnalysis; label: string }[] = [
  { key: 'ambiguities', label: 'Ambiguities' },
  { key: 'missingInformation', label: 'Missing information' },
  { key: 'contradictions', label: 'Contradictions' },
  { key: 'assumptions', label: 'Assumptions (not confirmed requirements)' },
];

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="analysis-block">
      <h4>{label}</h4>
      {items.length === 0 ? (
        <p className="muted small">None identified</p>
      ) : (
        <ul>
          {items.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: RequirementAnalysis }) {
  const attention = ATTENTION_LISTS.reduce((n, l) => n + (analysis[l.key] as string[]).length, 0);
  return (
    <section className="card" aria-label="Requirement analysis">
      <h2 className="card-title">Requirement analysis</h2>
      <p className="prewrap">{analysis.summary}</p>
      <div className="analysis-grid">
        {ANALYSIS_LISTS.map((l) => (
          <ListBlock key={l.key} label={l.label} items={analysis[l.key] as string[]} />
        ))}
      </div>
      <div className={attention > 0 ? 'warning' : 'analysis-clear'}>
        <h3>Needs clarification</h3>
        {attention === 0 ? (
          <p className="small">The analysis found no ambiguities, gaps or contradictions.</p>
        ) : (
          <div className="analysis-grid">
            {ATTENTION_LISTS.map((l) => (
              <ListBlock key={l.key} label={l.label} items={analysis[l.key] as string[]} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RowEditor({
  data,
  onSave,
  onCancel,
}: {
  data: GeneratedCase;
  onSave: (next: GeneratedCase) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    module: data.module,
    summary: data.summary,
    steps: data.steps.join('\n'),
    testData: data.testData,
    expectedResult: data.expectedResult,
    priority: data.priority,
    testType: data.testType,
    confirmed: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const id = `edit-${data.key}`;
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    const next: GeneratedCase = {
      ...data,
      module: draft.module.trim(),
      summary: draft.summary.trim(),
      steps: splitLines(draft.steps),
      testData: draft.testData.trim() || '[Not specified in the requirement]',
      expectedResult: draft.expectedResult.trim(),
      priority: draft.priority,
      testType: draft.testType,
      flags: {
        ...data.flags,
        moduleNeedsReview: draft.module.trim() === '',
        expectedResultNeedsClarification:
          data.flags.expectedResultNeedsClarification && !draft.confirmed,
      },
    };
    const found = validateGenerated(next);
    setErrors(found);
    if (Object.keys(found).length === 0) onSave(next);
  };

  return (
    <tr className="editor-row">
      <td colSpan={REVIEW_COLUMNS.length}>
        <div className="editor" role="group" aria-label={`Edit: ${data.summary}`}>
          <div className="field-row">
            <div className="field">
              <label htmlFor={`${id}-module`}>Module</label>
              <input
                id={`${id}-module`}
                type="text"
                value={draft.module}
                maxLength={LIMITS.module}
                onChange={(e) => set('module', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-summary`}>Summary</label>
              <input
                id={`${id}-summary`}
                type="text"
                value={draft.summary}
                aria-invalid={Boolean(errors.summary)}
                onChange={(e) => set('summary', e.target.value)}
              />
              {errors.summary && <p className="error-text">{errors.summary}</p>}
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-steps`}>Steps (one per line, in order)</label>
            <textarea
              id={`${id}-steps`}
              rows={5}
              value={draft.steps}
              aria-invalid={Boolean(errors.steps)}
              onChange={(e) => set('steps', e.target.value)}
            />
            {errors.steps && <p className="error-text">{errors.steps}</p>}
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor={`${id}-data`}>Test Data</label>
              <textarea
                id={`${id}-data`}
                rows={3}
                value={draft.testData}
                onChange={(e) => set('testData', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-expected`}>Expected Result</label>
              <textarea
                id={`${id}-expected`}
                rows={3}
                value={draft.expectedResult}
                aria-invalid={Boolean(errors.expectedResult)}
                onChange={(e) => set('expectedResult', e.target.value)}
              />
              {errors.expectedResult && <p className="error-text">{errors.expectedResult}</p>}
            </div>
          </div>
          {data.flags.expectedResultNeedsClarification && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.confirmed}
                onChange={(e) => set('confirmed', e.target.checked)}
              />
              I have confirmed the expected result with the requirement owner
            </label>
          )}
          <div className="field-row">
            <div className="field">
              <label htmlFor={`${id}-priority`}>Priority</label>
              <select
                id={`${id}-priority`}
                value={draft.priority}
                onChange={(e) => set('priority', e.target.value as GeneratedCase['priority'])}
              >
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-type`}>Test type</label>
              <select
                id={`${id}-type`}
                value={draft.testType}
                onChange={(e) => set('testType', e.target.value as GeneratedCase['testType'])}
              >
                {TEST_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="muted small">Actual Result stays blank until the test case is executed.</p>
          <div className="form-actions left">
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              Apply changes
            </button>
            <button type="button" className="btn btn-sm" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ReviewRow({
  row,
  onToggle,
  onEdit,
  onRemove,
}: {
  row: Row;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const c = row.data;
  return (
    <tr className={row.selected ? 'selected' : undefined}>
      <td className="id-cell">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={row.selected}
            onChange={onToggle}
            aria-label={`Approve: ${c.summary}`}
          />
          <span className="muted small">Assigned on save</span>
        </label>
      </td>
      <td>{c.module ? c.module : <span className="flag">Module needs review</span>}</td>
      <td className="summary-cell">
        <p className="summary-text">{c.summary}</p>
        <p className="meta-badges">
          <span className="chip">{c.scenarioType}</span>
          <span className="chip">{c.priority}</span>
          <span className="chip">{c.testType}</span>
        </p>
        {c.flags.expectedResultNeedsClarification && (
          <p className="flag">Needs clarification: {c.flags.clarificationNote}</p>
        )}
        {c.flags.possibleDuplicateOf.length > 0 && (
          <p className="flag">Possible duplicate of {c.flags.possibleDuplicateOf.join(', ')}</p>
        )}
        {c.sourceReference && <p className="muted small">Source: {c.sourceReference}</p>}
        <p className="row-tools">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onEdit}
            aria-label={`Edit: ${c.summary}`}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger-outline"
            onClick={onRemove}
            aria-label={`Remove: ${c.summary}`}
          >
            Remove
          </button>
        </p>
      </td>
      <td>
        <ol className="cell-steps">
          {c.steps.map((s, i) => (
            <li key={`${i}-${s}`}>{s}</li>
          ))}
        </ol>
      </td>
      <td className="prewrap">{c.testData}</td>
      <td className={c.flags.expectedResultNeedsClarification ? 'prewrap flagged' : 'prewrap'}>
        {c.expectedResult}
      </td>
      <td>
        <span className="visually-hidden">Blank until executed</span>
      </td>
    </tr>
  );
}

function ColumnHeaders() {
  return (
    <thead>
      <tr>
        {REVIEW_COLUMNS.map((name) => (
          <th key={name} scope="col" className="plain-th">
            {name}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function GeneratePage() {
  useDocumentTitle('Generate test cases');
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus, retry: false });

  const [requirement, setRequirement] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<SavedRow[]>([]);

  const generate = useMutation({
    mutationFn: (text: string) => api.generate(text),
    onSuccess: (response) => {
      setResult(response);
      setRows(response.testCases.map((data) => ({ data, selected: false, editing: false })));
      setSaved([]);
    },
  });

  const save = useMutation({
    mutationFn: (selected: Row[]) => api.createBulk(selected.map((r) => toTestCaseInput(r.data))),
    onSuccess: ({ created }, selected) => {
      setSaved((prev) => [
        ...prev,
        ...created.map((c) => ({ code: c.code, data: selected[c.index]!.data })),
      ]);
      const keys = new Set(selected.map((r) => r.data.key));
      setRows((prev) => prev.filter((r) => !keys.has(r.data.key)));
      notify('success', `Saved ${created.length} test case${created.length === 1 ? '' : 's'}`);
      void queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      void queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
  });

  const configured = status.data?.configured === true;
  const selected = rows.filter((r) => r.selected);
  const editingAny = rows.some((r) => r.editing);

  const submit = () => {
    const parsed = generateRequestSchema.safeParse({ requirement });
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? 'Enter requirement text');
      return;
    }
    setInputError(null);
    save.reset();
    generate.mutate(parsed.data.requirement);
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.data.key === key ? { ...r, ...patch } : r)));

  return (
    <>
      <PageHeader
        title="Generate test cases"
        crumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Test Cases', to: '/test-cases' },
          { label: 'Generate' },
        ]}
        subtitle="Paste a requirement. QALynks analyses it, drafts test cases, and saves only the ones you approve."
      />

      {status.data && !status.data.configured && (
        <div className="warning" role="status">
          <h2>AI generation is not configured</h2>
          <p>
            Set <code>ANTHROPIC_API_KEY</code> in the server environment and restart the API. Manual
            test case creation is not affected.
          </p>
        </div>
      )}
      {status.data?.mock && (
        <div className="warning" role="status">
          <h2>Test provider active</h2>
          <p>The output is fixed sample data. It is not generated from your requirement.</p>
        </div>
      )}

      <section className="card form-section">
        <div className="field">
          <label htmlFor="requirement">Requirement text</label>
          <textarea
            id="requirement"
            rows={10}
            value={requirement}
            maxLength={LIMITS.requirementMax}
            disabled={!configured || generate.isPending}
            aria-invalid={Boolean(inputError)}
            aria-describedby="requirement-hint"
            onChange={(e) => setRequirement(e.target.value)}
            placeholder="Paste user stories, acceptance criteria, a BRD section or functional requirements as plain text."
          />
          <p className="hint" id="requirement-hint">
            {requirement.length.toLocaleString()} / {LIMITS.requirementMax.toLocaleString()}{' '}
            characters. Plain text only. The text is sent to the configured AI provider.
          </p>
          {inputError && <p className="error-text">{inputError}</p>}
        </div>
        <div className="form-actions left">
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!configured || generate.isPending}
          >
            {generate.isPending ? 'Analysing…' : 'Analyse and generate'}
          </button>
        </div>
      </section>

      {generate.isPending && (
        <p className="state card" role="status">
          Analysing the requirement and generating test cases. This can take up to a minute.
        </p>
      )}

      {generate.isError && (
        <div className="error-summary" role="alert">
          <p>{generate.error.message}</p>
          {generate.error instanceof ApiError && generate.error.code === 'AI_RATE_LIMITED' && (
            <p className="small">
              Your requirement text is kept. Submit again when the wait is over.
            </p>
          )}
        </div>
      )}

      {result && (
        <>
          <AnalysisPanel analysis={result.analysis} />

          <section className="card" aria-label="Generated test cases">
            <div className="card-head">
              <h2 className="card-title">Review generated test cases ({rows.length} remaining)</h2>
              <p className="muted small">
                {result.provider} · {result.model}
              </p>
            </div>
            <p className="muted small">
              Nothing is saved until you approve it. Tick the cases to keep, edit or remove the
              rest, then save.
            </p>

            {rows.length === 0 ? (
              <p className="state">
                {result.testCases.length === 0
                  ? 'No test cases could be generated from this requirement. See the analysis above for gaps.'
                  : 'No cases left to review.'}
              </p>
            ) : (
              <>
                <div className="review-toolbar">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setRows((p) => p.map((r) => ({ ...r, selected: true })))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setRows((p) => p.map((r) => ({ ...r, selected: false })))}
                  >
                    Clear selection
                  </button>
                  <span aria-live="polite">{selected.length} selected</span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={selected.length === 0 || editingAny || save.isPending}
                    onClick={() => save.mutate(selected)}
                  >
                    {save.isPending ? 'Saving…' : `Save ${selected.length} approved`}
                  </button>
                </div>
                {save.isError && (
                  <div className="error-summary" role="alert">
                    <p>{save.error.message}</p>
                    {save.error instanceof ApiError &&
                      Object.entries(save.error.fields).map(([key, message]) => (
                        <p className="small" key={key}>
                          {key}: {message}
                        </p>
                      ))}
                  </div>
                )}
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Generated test cases table"
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard access to a scrollable region
                  tabIndex={0}
                >
                  <table className="review-table">
                    <caption className="visually-hidden">Generated test cases for review</caption>
                    <ColumnHeaders />
                    <tbody>
                      {rows.map((row) =>
                        row.editing ? (
                          <RowEditor
                            key={row.data.key}
                            data={row.data}
                            onCancel={() => update(row.data.key, { editing: false })}
                            onSave={(next) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.data.key === row.data.key
                                    ? { ...r, data: next, editing: false }
                                    : r,
                                ),
                              )
                            }
                          />
                        ) : (
                          <ReviewRow
                            key={row.data.key}
                            row={row}
                            onToggle={() => update(row.data.key, { selected: !row.selected })}
                            onEdit={() => update(row.data.key, { editing: true })}
                            onRemove={() =>
                              setRows((prev) => prev.filter((r) => r.data.key !== row.data.key))
                            }
                          />
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {saved.length > 0 && (
        <section className="card" aria-label="Saved test cases">
          <div className="card-head">
            <h2 className="card-title">Saved test cases ({saved.length})</h2>
            <Link className="btn btn-sm" to="/test-cases">
              View all test cases
            </Link>
          </div>
          <div className="table-scroll">
            <table className="review-table">
              <caption className="visually-hidden">Saved test cases</caption>
              <ColumnHeaders />
              <tbody>
                {saved.map(({ code, data }) => (
                  <tr key={code}>
                    <td className="mono">
                      <Link to={`/test-cases/${code}`}>{code}</Link>
                    </td>
                    <td>{data.module || <span className="muted">None</span>}</td>
                    <td>{data.summary}</td>
                    <td>
                      <ol className="cell-steps">
                        {data.steps.map((s, i) => (
                          <li key={`${i}-${s}`}>{s}</li>
                        ))}
                      </ol>
                    </td>
                    <td className="prewrap">{data.testData}</td>
                    <td className="prewrap">{data.expectedResult}</td>
                    <td>
                      <span className="visually-hidden">Blank until executed</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
