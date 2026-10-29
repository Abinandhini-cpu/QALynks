import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { formatDateTime } from '../format';
import { useDocumentTitle } from '../hooks';

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="detail-section">
      <h2>{label}</h2>
      {value ? <p className="prewrap">{value}</p> : <p className="muted">Not provided</p>}
    </section>
  );
}

export function TestCaseDetailPage() {
  const { code = '' } = useParams();
  useDocumentTitle(code);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['test-case', code],
    queryFn: () => api.get(code),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  const remove = useMutation({
    mutationFn: () => api.remove(code),
    onSuccess: () => {
      notify('success', `Deleted ${code}`);
      void queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      void queryClient.invalidateQueries({ queryKey: ['modules'] });
      queryClient.removeQueries({ queryKey: ['test-case', code] });
      void navigate('/test-cases');
    },
    onError: (err) => {
      notify('error', err.message);
      setConfirming(false);
    },
  });

  const crumbs = [
    { label: 'Dashboard', to: '/' },
    { label: 'Test Cases', to: '/test-cases' },
    { label: code },
  ];

  if (isPending) {
    return (
      <>
        <PageHeader title={code} crumbs={crumbs} />
        <p className="state card" role="status">
          Loading test case…
        </p>
      </>
    );
  }

  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? 'Test case not found' : 'Could not load test case'}
          crumbs={crumbs}
        />
        <div className="state card state-error" role="alert">
          <p>{notFound ? `${code} does not exist or was deleted.` : error?.message}</p>
          {notFound ? (
            <Link className="btn" to="/test-cases">
              Back to test cases
            </Link>
          ) : (
            <button type="button" className="btn" onClick={() => void refetch()}>
              Try again
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={data.title}
        crumbs={crumbs}
        subtitle={data.code}
        actions={
          <>
            <Link className="btn" to={`/test-cases/${data.code}/edit`}>
              Edit
            </Link>
            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          </>
        }
      />

      <div className="detail-grid">
        <div className="card detail-main">
          <TextBlock label="Description" value={data.description} />
          <TextBlock label="Preconditions" value={data.preconditions} />
          <section className="detail-section">
            <h2>Test steps</h2>
            {data.steps.length === 0 ? (
              <p className="muted">No steps added</p>
            ) : (
              <ol className="steps">
                {data.steps.map((step) => (
                  <li key={step.position}>
                    <p className="prewrap">{step.action}</p>
                    {step.expectedResult && (
                      <p className="step-expected prewrap">
                        <span>Expected:</span> {step.expectedResult}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <TextBlock label="Expected result" value={data.expectedResult} />
        </div>

        <aside className="card detail-meta" aria-label="Properties">
          <dl>
            <dt>Status</dt>
            <dd>
              <StatusBadge value={data.status} />
            </dd>
            <dt>Priority</dt>
            <dd>
              <PriorityBadge value={data.priority} />
            </dd>
            <dt>Test type</dt>
            <dd>{data.testType}</dd>
            <dt>Module</dt>
            <dd>{data.module || <span className="muted">None</span>}</dd>
            <dt>Tags</dt>
            <dd>
              {data.tags.length === 0 ? (
                <span className="muted">None</span>
              ) : (
                <ul className="chips">
                  {data.tags.map((tag) => (
                    <li key={tag} className="chip">
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
            <dt>Created</dt>
            <dd>{formatDateTime(data.createdAt)}</dd>
            <dt>Last updated</dt>
            <dd>{formatDateTime(data.updatedAt)}</dd>
            <dt>Revision</dt>
            <dd>{data.revision}</dd>
          </dl>
        </aside>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete test case?"
        confirmLabel="Delete test case"
        busy={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
      >
        <p>
          <strong>{data.code}</strong> “{data.title}” will be removed from the list and search. This
          cannot be undone from the app.
        </p>
      </ConfirmDialog>
    </>
  );
}
