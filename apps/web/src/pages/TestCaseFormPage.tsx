import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  LIMITS,
  PRIORITIES,
  STATUSES,
  TEST_TYPES,
  testCaseInputSchema,
  type DuplicateMatch,
  type TestCase,
  type TestCaseInput,
} from '@qalynks/shared';
import { ApiError, api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks';

interface StepState {
  key: number;
  action: string;
  expectedResult: string;
}

interface FormState {
  title: string;
  description: string;
  preconditions: string;
  expectedResult: string;
  priority: string;
  testType: string;
  module: string;
  status: string;
  tags: string[];
  tagDraft: string;
  steps: StepState[];
}

type Errors = Record<string, string>;

function toFormState(tc: TestCase | undefined, nextKey: () => number): FormState {
  return {
    title: tc?.title ?? '',
    description: tc?.description ?? '',
    preconditions: tc?.preconditions ?? '',
    expectedResult: tc?.expectedResult ?? '',
    priority: tc?.priority ?? 'Medium',
    testType: tc?.testType ?? 'Functional',
    module: tc?.module ?? '',
    status: tc?.status ?? 'Draft',
    tags: tc?.tags ?? [],
    tagDraft: '',
    steps: (tc?.steps ?? []).map((s) => ({
      key: nextKey(),
      action: s.action,
      expectedResult: s.expectedResult,
    })),
  };
}

/** Splits pasted or typed text such as "a, b;c" into individual tags. */
function splitTags(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function toInput(state: FormState): unknown {
  const pending = splitTags(state.tagDraft).filter(
    (p) => !state.tags.some((t) => t.toLowerCase() === p.toLowerCase()),
  );
  return {
    title: state.title,
    description: state.description,
    preconditions: state.preconditions,
    steps: state.steps.map(({ action, expectedResult }) => ({ action, expectedResult })),
    expectedResult: state.expectedResult,
    priority: state.priority,
    testType: state.testType,
    module: state.module,
    tags: [...state.tags, ...pending],
    status: state.status,
  };
}

function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error-text" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TestCaseFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { code = '' } = useParams();
  useDocumentTitle(mode === 'create' ? 'New test case' : `Edit ${code}`);

  const existing = useQuery({
    queryKey: ['test-case', code],
    queryFn: () => api.get(code),
    enabled: mode === 'edit',
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  const crumbs = [
    { label: 'Dashboard', to: '/' },
    { label: 'Test Cases', to: '/test-cases' },
    ...(mode === 'edit'
      ? [{ label: code, to: `/test-cases/${code}` }, { label: 'Edit' }]
      : [{ label: 'New' }]),
  ];

  if (mode === 'edit' && existing.isPending) {
    return (
      <>
        <PageHeader title={`Edit ${code}`} crumbs={crumbs} />
        <p className="state card" role="status">
          Loading test case…
        </p>
      </>
    );
  }
  if (mode === 'edit' && (existing.error || !existing.data)) {
    const notFound = existing.error instanceof ApiError && existing.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? 'Test case not found' : 'Could not load test case'}
          crumbs={crumbs}
        />
        <div className="state card state-error" role="alert">
          <p>{notFound ? `${code} does not exist or was deleted.` : existing.error?.message}</p>
          <Link className="btn" to="/test-cases">
            Back to test cases
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={mode === 'create' ? 'New test case' : `Edit ${code}`}
        crumbs={crumbs}
        subtitle={mode === 'create' ? 'An ID is assigned automatically when you save.' : undefined}
      />
      <TestCaseForm key={code || 'new'} mode={mode} code={code} initial={existing.data} />
    </>
  );
}

function TestCaseForm({
  mode,
  code,
  initial,
}: {
  mode: 'create' | 'edit';
  code: string;
  initial?: TestCase;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const keyCounter = useRef(1);
  const nextKey = () => keyCounter.current++;

  const [state, setState] = useState<FormState>(() => toFormState(initial, nextKey));
  const [errors, setErrors] = useState<Errors>({});
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checking, setChecking] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    if (key === 'title' || key === 'module') setDuplicates([]);
  };

  const save = useMutation({
    mutationFn: async (input: TestCaseInput) =>
      mode === 'create' ? (await api.create(input)).testCase : api.update(code, input),
    onSuccess: (saved) => {
      notify(
        'success',
        mode === 'create' ? `Created ${saved.code}` : `Saved changes to ${saved.code}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      void queryClient.invalidateQueries({ queryKey: ['modules'] });
      queryClient.setQueryData(['test-case', saved.code], saved);
      void navigate(`/test-cases/${saved.code}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        setErrors(err.fields);
        queueMicrotask(() => summaryRef.current?.focus());
      } else {
        setErrors({ _form: err.message });
        queueMicrotask(() => summaryRef.current?.focus());
      }
      notify('error', 'Could not save the test case');
    },
  });

  const submit = async (skipDuplicateCheck: boolean) => {
    const parsed = testCaseInputSchema.safeParse(toInput(state));
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
      setErrors(next);
      queueMicrotask(() => summaryRef.current?.focus());
      return;
    }
    setErrors({});

    if (!skipDuplicateCheck) {
      setChecking(true);
      try {
        const { duplicates: found } = await api.checkDuplicates({
          title: parsed.data.title,
          module: parsed.data.module,
          excludeCode: mode === 'edit' ? code : undefined,
        });
        if (found.length > 0) {
          setDuplicates(found);
          return;
        }
      } catch {
        // The check is advisory. Saving still validates on the server.
      } finally {
        setChecking(false);
      }
    }
    save.mutate(parsed.data);
  };

  const addTag = () => {
    const parts = splitTags(state.tagDraft);
    if (parts.length === 0) return;
    setState((s) => {
      const tags = [...s.tags];
      for (const part of parts) {
        if (!tags.some((t) => t.toLowerCase() === part.toLowerCase())) tags.push(part);
      }
      return { ...s, tags, tagDraft: '' };
    });
  };

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const updateStep = (index: number, patch: Partial<StepState>) =>
    setState((s) => ({
      ...s,
      steps: s.steps.map((st, i) => (i === index ? { ...st, ...patch } : st)),
    }));

  const moveStep = (index: number, direction: -1 | 1) =>
    setState((s) => {
      const target = index + direction;
      if (target < 0 || target >= s.steps.length) return s;
      const steps = [...s.steps];
      [steps[index], steps[target]] = [steps[target]!, steps[index]!];
      return { ...s, steps };
    });

  const tagsError = Object.entries(errors).find(
    ([k]) => k === 'tags' || k.startsWith('tags.'),
  )?.[1];
  const stepsError = errors.steps;
  const errorCount = Object.keys(errors).length;
  const busy = save.isPending || checking;

  const text = (
    id: keyof FormState & string,
    label: string,
    opts: { required?: boolean; hint?: string; max: number },
  ) => (
    <Field
      id={`field-${id}`}
      label={label}
      error={errors[id]}
      hint={opts.hint}
      required={opts.required}
    >
      <input
        id={`field-${id}`}
        type="text"
        value={state[id] as string}
        onChange={(e) => set(id, e.target.value as never)}
        maxLength={opts.max}
        aria-invalid={Boolean(errors[id])}
        aria-describedby={describedBy(`field-${id}`, errors[id], opts.hint)}
        aria-required={opts.required}
      />
    </Field>
  );

  const area = (
    id: 'description' | 'preconditions' | 'expectedResult',
    label: string,
    rows = 3,
  ) => (
    <Field id={`field-${id}`} label={label} error={errors[id]}>
      <textarea
        id={`field-${id}`}
        rows={rows}
        value={state[id]}
        onChange={(e) => set(id, e.target.value)}
        maxLength={LIMITS.longText}
        aria-invalid={Boolean(errors[id])}
        aria-describedby={describedBy(`field-${id}`, errors[id])}
      />
    </Field>
  );

  const select = (
    id: 'priority' | 'testType' | 'status',
    label: string,
    options: readonly string[],
  ) => (
    <Field id={`field-${id}`} label={label} error={errors[id]} required>
      <select
        id={`field-${id}`}
        value={state[id]}
        onChange={(e) => set(id, e.target.value)}
        aria-invalid={Boolean(errors[id])}
        aria-describedby={describedBy(`field-${id}`, errors[id])}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      {errorCount > 0 && (
        <div className="error-summary" role="alert" tabIndex={-1} ref={summaryRef}>
          {errors._form ? (
            <p>{errors._form}</p>
          ) : (
            <>
              <p>
                {errorCount === 1 ? 'There is 1 problem' : `There are ${errorCount} problems`} with
                this form:
              </p>
              <ul>
                {Object.entries(errors).map(([key, message]) => (
                  <li key={key}>{message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="warning" role="alert">
          <h2>Possible duplicate</h2>
          <p>
            {duplicates.length === 1 ? 'A test case' : `${duplicates.length} test cases`} with a
            very similar title already {duplicates.length === 1 ? 'exists' : 'exist'}:
          </p>
          <ul>
            {duplicates.map((d) => (
              <li key={d.code}>
                <Link to={`/test-cases/${d.code}`} target="_blank" rel="noreferrer">
                  {d.code}: {d.title}
                </Link>
                {d.module ? ` (${d.module})` : ''}
                {d.sameModule && <strong> same module</strong>}
              </li>
            ))}
          </ul>
          <div className="warning-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              Save anyway
            </button>
            <button type="button" className="btn" onClick={() => setDuplicates([])}>
              Keep editing
            </button>
          </div>
        </div>
      )}

      <section className="card form-section">
        <h2 className="card-title">Basics</h2>
        {text('title', 'Title', { required: true, max: LIMITS.title })}
        {area('description', 'Description')}
        {area('preconditions', 'Preconditions', 2)}
        <div className="field-row">
          {text('module', 'Module or component', {
            max: LIMITS.module,
            hint: 'For example Authentication or Checkout',
          })}
          <Field
            id="field-tag-input"
            label="Tags"
            error={tagsError}
            hint="Press Enter or comma to add a tag"
          >
            <div className="tag-input">
              {state.tags.length > 0 && (
                <ul className="chips">
                  {state.tags.map((tag) => (
                    <li key={tag} className="chip">
                      {tag}
                      <button
                        type="button"
                        className="chip-remove"
                        aria-label={`Remove tag ${tag}`}
                        onClick={() =>
                          set(
                            'tags',
                            state.tags.filter((t) => t !== tag),
                          )
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                id="field-tag-input"
                type="text"
                value={state.tagDraft}
                onChange={(e) => set('tagDraft', e.target.value)}
                onKeyDown={onTagKey}
                onBlur={addTag}
                maxLength={LIMITS.tag}
                aria-invalid={Boolean(tagsError)}
                aria-describedby={describedBy('field-tag-input', tagsError, 'hint')}
              />
            </div>
          </Field>
        </div>
      </section>

      <section className="card form-section">
        <div className="card-head">
          <h2 className="card-title">Test steps</h2>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              set('steps', [...state.steps, { key: nextKey(), action: '', expectedResult: '' }])
            }
            disabled={state.steps.length >= LIMITS.maxSteps}
          >
            Add step
          </button>
        </div>
        {stepsError && <p className="error-text">{stepsError}</p>}
        {state.steps.length === 0 ? (
          <p className="muted">No steps yet. Add the actions a tester should perform, in order.</p>
        ) : (
          <ol className="step-editor">
            {state.steps.map((step, i) => (
              <li key={step.key} className="step-row">
                <span className="step-number" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="step-fields">
                  <Field
                    id={`step-${i}-action`}
                    label={`Step ${i + 1} action`}
                    error={errors[`steps.${i}.action`]}
                    required
                  >
                    <textarea
                      id={`step-${i}-action`}
                      rows={2}
                      value={step.action}
                      onChange={(e) => updateStep(i, { action: e.target.value })}
                      maxLength={LIMITS.stepText}
                      aria-invalid={Boolean(errors[`steps.${i}.action`])}
                      aria-describedby={describedBy(
                        `step-${i}-action`,
                        errors[`steps.${i}.action`],
                      )}
                    />
                  </Field>
                  <Field
                    id={`step-${i}-expected`}
                    label={`Step ${i + 1} expected result`}
                    error={errors[`steps.${i}.expectedResult`]}
                  >
                    <textarea
                      id={`step-${i}-expected`}
                      rows={2}
                      value={step.expectedResult}
                      onChange={(e) => updateStep(i, { expectedResult: e.target.value })}
                      maxLength={LIMITS.stepText}
                    />
                  </Field>
                </div>
                <div className="step-tools">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => moveStep(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move step ${i + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => moveStep(i, 1)}
                    disabled={i === state.steps.length - 1}
                    aria-label={`Move step ${i + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger-outline"
                    onClick={() =>
                      set(
                        'steps',
                        state.steps.filter((_, idx) => idx !== i),
                      )
                    }
                    aria-label={`Remove step ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        {area('expectedResult', 'Overall expected result')}
      </section>

      <section className="card form-section">
        <h2 className="card-title">Classification</h2>
        <div className="field-row three">
          {select('priority', 'Priority', PRIORITIES)}
          {select('testType', 'Test type', TEST_TYPES)}
          {select('status', 'Status', STATUSES)}
        </div>
      </section>

      <div className="form-actions">
        <Link className="btn" to={mode === 'edit' ? `/test-cases/${code}` : '/test-cases'}>
          Cancel
        </Link>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : mode === 'create' ? 'Create test case' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
