import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  listQuerySchema,
  PRIORITIES,
  STATUSES,
  TEST_TYPES,
  type SortField,
  type TestCaseSummary,
} from '@qalynks/shared';
import { api, type ListParams } from '../api/client';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';
import { formatDate } from '../format';
import { useDebouncedValue, useDocumentTitle } from '../hooks';

const PAGE_SIZE = 20;

const COLUMNS: { field: SortField; label: string }[] = [
  { field: 'code', label: 'ID' },
  { field: 'title', label: 'Title' },
  { field: 'module', label: 'Module' },
  { field: 'priority', label: 'Priority' },
  { field: 'testType', label: 'Type' },
  { field: 'status', label: 'Status' },
  { field: 'updatedAt', label: 'Last updated' },
];

function readParams(search: URLSearchParams) {
  const parsed = listQuerySchema.safeParse(Object.fromEntries(search));
  return parsed.success ? parsed.data : listQuerySchema.parse({});
}

export function TestCaseListPage() {
  useDocumentTitle('Test Cases');
  const [search, setSearch] = useSearchParams();
  const query = readParams(search);
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [text, setText] = useState(query.q ?? '');
  const debounced = useDebouncedValue(text.trim(), 300);
  const lastPushed = useRef(query.q ?? '');
  const [pendingDelete, setPendingDelete] = useState<TestCaseSummary | null>(null);

  const update = (patch: Record<string, string | undefined>, keepPage = false) => {
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!keepPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (debounced !== lastPushed.current) {
      lastPushed.current = debounced;
      update({ q: debounced || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const urlQ = query.q ?? '';
  useEffect(() => {
    if (urlQ !== lastPushed.current) {
      lastPushed.current = urlQ;
      setText(urlQ);
    }
  }, [urlQ]);

  const params: ListParams = { ...query, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['test-cases', params],
    queryFn: () => api.list(params),
    placeholderData: keepPreviousData,
  });
  const modules = useQuery({ queryKey: ['modules'], queryFn: api.modules });

  const remove = useMutation({
    mutationFn: (code: string) => api.remove(code),
    onSuccess: (_data, code) => {
      notify('success', `Deleted ${code}`);
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      void queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
    onError: (err) => {
      notify('error', err instanceof Error ? err.message : 'Could not delete the test case');
      setPendingDelete(null);
    },
  });

  const sortBy = (field: SortField) => {
    const order = query.sort === field && query.order === 'asc' ? 'desc' : 'asc';
    update({ sort: field, order });
  };

  const hasFilters = Boolean(
    query.q || query.priority || query.testType || query.status || query.module,
  );
  const clearAll = () => {
    setText('');
    lastPushed.current = '';
    setSearch({}, { replace: true });
  };

  const data = list.data;

  return (
    <>
      <PageHeader
        title="Test Cases"
        crumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Test Cases' }]}
        subtitle={data ? `${data.filteredTotal} of ${data.total} test cases` : undefined}
        actions={
          <>
            <Link className="btn" to="/test-cases/generate">
              Generate from requirement
            </Link>
            <Link className="btn" to="/test-cases/import">
              Import CSV
            </Link>
            <a className="btn" href={api.exportUrl(params)} download>
              Export CSV
            </a>
            <Link className="btn btn-primary" to="/test-cases/new">
              New test case
            </Link>
          </>
        }
      />

      <section className="card toolbar" aria-label="Search and filters">
        <div className="field grow">
          <label htmlFor="search">Search by ID or title</label>
          <input
            id="search"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. TC-0007 or login"
            maxLength={200}
          />
        </div>
        <Select
          label="Priority"
          value={query.priority}
          options={PRIORITIES}
          onChange={(v) => update({ priority: v })}
        />
        <Select
          label="Type"
          value={query.testType}
          options={TEST_TYPES}
          onChange={(v) => update({ testType: v })}
        />
        <Select
          label="Status"
          value={query.status}
          options={STATUSES}
          onChange={(v) => update({ status: v })}
        />
        <Select
          label="Module"
          value={query.module}
          options={modules.data?.modules ?? []}
          onChange={(v) => update({ module: v })}
        />
        {hasFilters && (
          <button type="button" className="btn btn-link" onClick={clearAll}>
            Clear all
          </button>
        )}
      </section>

      <section className="card table-card" aria-busy={list.isFetching}>
        {list.isPending ? (
          <p className="state" role="status">
            Loading test cases…
          </p>
        ) : list.isError ? (
          <div className="state state-error" role="alert">
            <p>{list.error.message}</p>
            <button type="button" className="btn" onClick={() => void list.refetch()}>
              Try again
            </button>
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="state">
            {data.total === 0 ? (
              <>
                <h2>No test cases yet</h2>
                <p>Create your first test case or import a CSV file.</p>
                <Link className="btn btn-primary" to="/test-cases/new">
                  New test case
                </Link>
              </>
            ) : (
              <>
                <h2>No test cases match your search</h2>
                <p>Try a different keyword or remove some filters.</p>
                <button type="button" className="btn" onClick={clearAll}>
                  Clear search and filters
                </button>
              </>
            )}
          </div>
        ) : (
          data && (
            <>
              <div
                className="table-scroll"
                role="region"
                aria-label="Test cases table"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard access to a scrollable region
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      {COLUMNS.map((col) => (
                        <th
                          key={col.field}
                          scope="col"
                          aria-sort={
                            query.sort === col.field
                              ? query.order === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            type="button"
                            className="sort-btn"
                            onClick={() => sortBy(col.field)}
                          >
                            {col.label}
                            <span aria-hidden="true" className="sort-icon">
                              {query.sort === col.field ? (query.order === 'asc' ? '▲' : '▼') : ''}
                            </span>
                          </button>
                        </th>
                      ))}
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.code}>
                        <td className="mono">{item.code}</td>
                        <td className="title-cell">
                          <Link to={`/test-cases/${item.code}`}>{item.title}</Link>
                        </td>
                        <td>{item.module || <span className="muted">None</span>}</td>
                        <td>
                          <PriorityBadge value={item.priority} />
                        </td>
                        <td>{item.testType}</td>
                        <td>
                          <StatusBadge value={item.status} />
                        </td>
                        <td>{formatDate(item.updatedAt)}</td>
                        <td className="row-actions">
                          <Link
                            className="btn btn-sm"
                            to={`/test-cases/${item.code}`}
                            aria-label={`View ${item.code}`}
                          >
                            View
                          </Link>
                          <Link
                            className="btn btn-sm"
                            to={`/test-cases/${item.code}/edit`}
                            aria-label={`Edit ${item.code}`}
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger-outline"
                            aria-label={`Delete ${item.code}`}
                            onClick={() => setPendingDelete(item)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.filteredTotal}
                onPage={(p) => update({ page: String(p) }, true)}
              />
            </>
          )
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete test case?"
        confirmLabel="Delete test case"
        busy={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.code)}
      >
        <p>
          <strong>{pendingDelete?.code}</strong> “{pendingDelete?.title}” will be removed from the
          list and search. This cannot be undone from the app.
        </p>
      </ConfirmDialog>
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
}) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
