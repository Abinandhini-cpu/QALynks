import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { LIMITS, type ImportResult } from '@qalynks/shared';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks';

const TEMPLATE = [
  'title,description,preconditions,steps,expected_result,priority,test_type,module,tags,status',
  '"Login with valid credentials","Happy path","User exists","Open login page :: Form is shown\nSubmit credentials :: Dashboard opens","User is signed in",High,Smoke,Authentication,login;smoke,Ready',
].join('\r\n');

export function ImportPage() {
  useDocumentTitle('Import test cases');
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async (selected: File) => api.importCsv(await selected.text()),
    onSuccess: (result) => {
      notify('success', `Imported ${result.created.length} of ${result.totalRows} rows`);
      void queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      void queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
  });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    run.reset();
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!/\.csv$/i.test(selected.name)) {
      setFile(null);
      setFileError('Choose a .csv file.');
      return;
    }
    if (selected.size > LIMITS.maxImportBytes) {
      setFile(null);
      setFileError('The file is larger than 1 MB. Split it into smaller files.');
      return;
    }
    setFile(selected);
  };

  const result: ImportResult | undefined = run.data;

  return (
    <>
      <PageHeader
        title="Import test cases"
        crumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Test Cases', to: '/test-cases' },
          { label: 'Import' },
        ]}
        subtitle="Upload a CSV file. Valid rows are imported; problems are reported by row."
      />

      <div className="detail-grid">
        <section className="card form-section">
          <h2 className="card-title">Choose a file</h2>
          <div className="field">
            <label htmlFor="csv-file">CSV file (up to 1 MB, {LIMITS.maxImportRows} rows)</label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              aria-describedby={fileError ? 'csv-file-error' : undefined}
            />
            {fileError && (
              <p className="error-text" id="csv-file-error" role="alert">
                {fileError}
              </p>
            )}
          </div>
          <div className="form-actions left">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!file || run.isPending}
              onClick={() => file && run.mutate(file)}
            >
              {run.isPending ? 'Importing…' : 'Import'}
            </button>
            <a
              className="btn"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
              download="qalynks-import-template.csv"
            >
              Download template
            </a>
          </div>
          {run.isError && (
            <div className="error-summary" role="alert">
              <p>{run.error.message}</p>
            </div>
          )}
        </section>

        <aside className="card format-help">
          <h2 className="card-title">File format</h2>
          <p>
            Required columns: <code>title</code>, <code>priority</code>, <code>test_type</code>,{' '}
            <code>status</code>.
          </p>
          <p>
            Optional: <code>description</code>, <code>preconditions</code>, <code>steps</code>,{' '}
            <code>expected_result</code>, <code>module</code>, <code>tags</code>. Other columns,
            such as <code>id</code>, are ignored.
          </p>
          <ul>
            <li>
              Steps: one per line, written as <code>action :: expected result</code>.
            </li>
            <li>Tags: separated by semicolons.</li>
            <li>Rows that match an existing title and module are skipped, not duplicated.</li>
            <li>New IDs are always assigned by QALynks.</li>
          </ul>
        </aside>
      </div>

      {result && (
        <section className="card form-section" aria-label="Import results" aria-live="polite">
          <h2 className="card-title">Import results</h2>
          <ul className="result-summary">
            <li>
              <strong>{result.created.length}</strong> created
            </li>
            <li>
              <strong>{result.skippedDuplicates.length}</strong> skipped as duplicates
            </li>
            <li>
              <strong>{result.failed.length}</strong> failed
            </li>
            <li>
              <strong>{result.totalRows}</strong> rows read
            </li>
          </ul>

          {result.failed.length > 0 && (
            <>
              <h3>Rows with errors</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Problems</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.failed.map((f) => (
                      <tr key={f.row}>
                        <td>{f.row}</td>
                        <td>
                          <ul className="plain">
                            {Object.entries(f.errors).map(([column, message]) => (
                              <li key={column}>
                                <code>{column === '_row' ? 'row' : column}</code>: {message}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.skippedDuplicates.length > 0 && (
            <>
              <h3>Skipped duplicates</h3>
              <ul className="plain">
                {result.skippedDuplicates.map((d) => (
                  <li key={d.row}>
                    Row {d.row}: “{d.title}” matches {d.duplicateOf}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="form-actions left">
            <Link className="btn btn-primary" to="/test-cases">
              View test cases
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
