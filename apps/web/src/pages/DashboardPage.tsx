import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PRIORITIES, STATUSES, TEST_TYPES } from '@qalynks/shared';
import { api } from '../api/client';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { PageHeader } from '../components/PageHeader';
import { formatDate } from '../format';
import { useDocumentTitle } from '../hooks';

function Distribution({
  title,
  counts,
  total,
}: {
  title: string;
  counts: [string, number][];
  total: number;
}) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      <ul className="bars">
        {counts.map(([label, n]) => (
          <li key={label}>
            <span className="bar-label">{label}</span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
            </span>
            <span className="bar-value">{n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['summary'],
    queryFn: api.summary,
  });

  const header = (
    <PageHeader
      title="Dashboard"
      crumbs={[{ label: 'Dashboard' }]}
      subtitle="Overview of your test case library"
      actions={
        <Link className="btn btn-primary" to="/test-cases/new">
          New test case
        </Link>
      }
    />
  );

  if (isPending) {
    return (
      <>
        {header}
        <p className="state card" role="status">
          Loading overview…
        </p>
      </>
    );
  }
  if (error) {
    return (
      <>
        {header}
        <div className="state card state-error" role="alert">
          <p>{error.message}</p>
          <button type="button" className="btn" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <section className="stat-grid" aria-label="Totals">
        <div className="card stat">
          <p className="stat-value">{data.total}</p>
          <p className="stat-label">Total test cases</p>
        </div>
        {STATUSES.map((s) => (
          <div className="card stat" key={s}>
            <p className="stat-value">{data.byStatus[s]}</p>
            <p className="stat-label">{s}</p>
          </div>
        ))}
      </section>

      {data.total === 0 ? (
        <div className="card state">
          <h2>Start your test library</h2>
          <p>There are no test cases yet. Create one or import a CSV file.</p>
          <div className="state-actions">
            <Link className="btn btn-primary" to="/test-cases/new">
              New test case
            </Link>
            <Link className="btn" to="/test-cases/generate">
              Generate from requirement
            </Link>
            <Link className="btn" to="/test-cases/import">
              Import CSV
            </Link>
          </div>
        </div>
      ) : (
        <div className="dash-grid">
          <Distribution
            title="By priority"
            total={data.total}
            counts={PRIORITIES.map((p) => [p, data.byPriority[p]])}
          />
          <Distribution
            title="By test type"
            total={data.total}
            counts={TEST_TYPES.map((t) => [t, data.byType[t]])}
          />
          <section className="card dash-recent">
            <div className="card-head">
              <h2 className="card-title">Recently updated</h2>
              <Link to="/test-cases">View all</Link>
            </div>
            <ul className="recent-list">
              {data.recent.map((tc) => (
                <li key={tc.code}>
                  <div>
                    <Link to={`/test-cases/${tc.code}`}>{tc.title}</Link>
                    <p className="muted small">
                      <span className="mono">{tc.code}</span> · {formatDate(tc.updatedAt)}
                    </p>
                  </div>
                  <div className="recent-badges">
                    <PriorityBadge value={tc.priority} />
                    <StatusBadge value={tc.status} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
