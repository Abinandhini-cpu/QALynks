import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImportResult, TestCase } from '@qalynks/shared';
import { BOM, escapeCell, parseCsv, toCsv } from '../src/services/csv';
import { createCase, createTestApp, type TestApp } from './helpers';

const HEADER = 'title,priority,test_type,status,module,tags,steps,description';

let t: TestApp;
beforeEach(async () => {
  t = createTestApp();
  await t.app.ready();
});
afterEach(async () => {
  await t.app.close();
  t.db.close();
});

const importCsv = (body: string) =>
  t.app.inject({
    method: 'POST',
    url: '/api/test-cases/import',
    headers: { 'content-type': 'text/csv' },
    payload: body,
  });

describe('escapeCell', () => {
  it('prefixes formula triggers with a single quote', () => {
    for (const v of ['=SUM(A1)', '+1', '-2', '@cmd', '\tTAB', '  =pad']) {
      expect(escapeCell(v).startsWith("'") || escapeCell(v).startsWith('"\'')).toBe(true);
    }
    expect(escapeCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
  });

  it('quotes cells containing commas, quotes and newlines only', () => {
    expect(escapeCell('plain')).toBe('plain');
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('l1\nl2')).toBe('"l1\nl2"');
  });
});

describe('export', () => {
  it('exports the current filtered set with consistent headers and a download name', async () => {
    await createCase(t.app, { title: 'Keep me', priority: 'Critical' });
    await createCase(t.app, { title: 'Drop me', priority: 'Low' });
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/test-cases/export.csv?priority=Critical',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="qalynks-test-cases-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const lines = res.body.replace(BOM, '').trim().split('\r\n');
    expect(lines[0]).toBe(
      'id,title,description,preconditions,steps,expected_result,priority,test_type,module,tags,status,created_at,updated_at',
    );
    expect(res.body).toContain('Keep me');
    expect(res.body).not.toContain('Drop me');
  });

  it('neutralises formula injection in exported data', async () => {
    await createCase(t.app, {
      title: '=cmd|"/c calc"!A1',
      description: '@SUM(1)',
      module: '+evil',
      tags: ['-tag'],
    });
    const res = await t.app.inject({ method: 'GET', url: '/api/test-cases/export.csv' });
    const body = res.body;
    expect(body).toContain("'=cmd|");
    expect(body).toContain("'@SUM(1)");
    expect(body).toContain("'+evil");
    expect(body).toContain("'-tag");
    for (const cell of body.split(/[,\r\n]/)) {
      expect(cell.replace(/^"/, '')).not.toMatch(/^[=+@]/);
    }
  });

  it('excludes soft-deleted records and handles an empty set', async () => {
    const a = await createCase(t.app, { title: 'Removed' });
    await t.app.inject({ method: 'DELETE', url: `/api/test-cases/${a.code}` });
    const res = await t.app.inject({ method: 'GET', url: '/api/test-cases/export.csv' });
    expect(res.body.replace(BOM, '').trim().split('\r\n')).toHaveLength(1);
  });

  it('round-trips through import without data loss', async () => {
    await createCase(t.app, {
      title: '=Formula, "quoted" title',
      steps: [
        { action: 'Step one', expectedResult: 'Result one' },
        { action: 'Step two', expectedResult: '' },
      ],
      tags: ['a', 'b'],
      module: 'Mod',
    });
    const exported = (await t.app.inject({ method: 'GET', url: '/api/test-cases/export.csv' }))
      .body;

    const fresh = createTestApp();
    await fresh.app.ready();
    const res = await fresh.app.inject({
      method: 'POST',
      url: '/api/test-cases/import',
      headers: { 'content-type': 'text/csv' },
      payload: exported,
    });
    expect((res.json() as ImportResult).created).toHaveLength(1);
    const got = (
      await fresh.app.inject({ method: 'GET', url: '/api/test-cases/TC-0001' })
    ).json() as TestCase;
    expect(got.title).toBe('=Formula, "quoted" title');
    expect(got.steps).toEqual([
      { position: 1, action: 'Step one', expectedResult: 'Result one' },
      { position: 2, action: 'Step two', expectedResult: '' },
    ]);
    expect(got.tags).toEqual(['a', 'b']);
    await fresh.app.close();
    fresh.db.close();
  });
});

describe('import', () => {
  it('creates valid rows and parses steps and tags', async () => {
    const res = await importCsv(
      `${HEADER}\r\nLogin works,High,Smoke,Ready,Auth,login;smoke,"Open page :: Page loads\nSubmit",Desc`,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as ImportResult;
    expect(body).toMatchObject({ totalRows: 1, skippedDuplicates: [], failed: [] });
    expect(body.created).toEqual([{ row: 2, code: 'TC-0001' }]);
    const tc = (
      await t.app.inject({ method: 'GET', url: '/api/test-cases/TC-0001' })
    ).json() as TestCase;
    expect(tc.steps).toEqual([
      { position: 1, action: 'Open page', expectedResult: 'Page loads' },
      { position: 2, action: 'Submit', expectedResult: '' },
    ]);
    expect(tc.tags).toEqual(['login', 'smoke']);
  });

  it('accepts a UTF-8 BOM and flexible header spelling', async () => {
    const res = await importCsv(`${BOM}Title,Priority,Test Type,Status\r\nBOM case,Low,UI,Draft`);
    expect((res.json() as ImportResult).created).toHaveLength(1);
  });

  it('reports row-level errors and still imports the valid rows', async () => {
    const res = await importCsv(
      [
        HEADER,
        'Good one,High,Smoke,Ready,,,,',
        ',High,Smoke,Ready,,,,',
        'Bad enums,Urgent,Nope,Done,,,,',
        `${'x'.repeat(201)},High,Smoke,Ready,,,,`,
        'Too many,High,Smoke,Ready,,,,,extra,columns',
      ].join('\n'),
    );
    const body = res.json() as ImportResult;
    expect(body.created.map((c) => c.row)).toEqual([2]);
    expect(body.failed.map((f) => f.row)).toEqual([3, 4, 5, 6]);
    expect(body.failed[0]?.errors.title).toBe('Title is required');
    expect(body.failed[1]?.errors).toMatchObject({
      priority: 'Select a priority',
      test_type: 'Select a test type',
      status: 'Select a status',
    });
    expect(body.failed[2]?.errors.title).toContain('200');
    expect(body.failed[3]?.errors._row).toContain('more values');
    const count = t.db.prepare('SELECT COUNT(*) AS n FROM test_cases').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('skips duplicates of existing records and of earlier rows, and reports them', async () => {
    const existing = await createCase(t.app, { title: 'Existing case', module: 'Auth' });
    const res = await importCsv(
      [
        HEADER,
        'existing  CASE!,High,Smoke,Ready,auth,,,',
        'Existing case,High,Smoke,Ready,Other,,,',
        'Fresh,High,Smoke,Ready,,,,',
        'fresh,Low,UI,Draft,,,,',
      ].join('\n'),
    );
    const body = res.json() as ImportResult;
    expect(body.skippedDuplicates).toEqual([
      { row: 2, title: 'existing  CASE!', duplicateOf: existing.code },
      { row: 5, title: 'fresh', duplicateOf: 'row 4' },
    ]);
    expect(body.created.map((c) => c.row)).toEqual([3, 4]);
  });

  it('re-importing the same file does not create duplicates', async () => {
    const file = `${HEADER}\nOnce only,High,Smoke,Ready,,,,`;
    await importCsv(file);
    const again = (await importCsv(file)).json() as ImportResult;
    expect(again.created).toEqual([]);
    expect(again.skippedDuplicates).toHaveLength(1);
  });

  it('rejects files with missing columns, no data, or malformed content', async () => {
    const cases: [string, string][] = [
      ['title,priority\nA,High', 'Missing required column(s): test_type, status'],
      [HEADER, 'no data rows'],
      ['   ', 'empty'],
      [`${HEADER}\n"unterminated,High,Smoke,Ready`, 'Malformed CSV'],
    ];
    for (const [body, expected] of cases) {
      const res = await importCsv(body);
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: { message: string } }).error.message).toContain(expected);
    }
  });

  it('rejects too many rows, oversized bodies and the wrong content type', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => `Case ${i},High,Smoke,Ready`).join('\n');
    const many = await importCsv(`title,priority,test_type,status\n${rows}`);
    expect(many.statusCode).toBe(400);
    expect((many.json() as { error: { message: string } }).error.message).toContain(
      'Too many rows',
    );

    const big = await importCsv(`${HEADER}\n${'a'.repeat(1024 * 1024 + 10)}`);
    expect(big.statusCode).toBe(413);

    const wrong = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases/import',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(wrong.statusCode).toBe(400);
  });

  it('treats formula-looking cells as plain data and never executes anything', async () => {
    await importCsv(`${HEADER}\n=1+1,High,Smoke,Ready,,,,`);
    const tc = (
      await t.app.inject({ method: 'GET', url: '/api/test-cases/TC-0001' })
    ).json() as TestCase;
    expect(tc.title).toBe('=1+1');
  });
});

describe('parseCsv', () => {
  it('numbers rows like a spreadsheet (header is row 1)', () => {
    const rows = parseCsv(`${HEADER}\nA,High,Smoke,Ready,,,,\nB,High,Smoke,Ready,,,,`);
    expect(rows.map((r) => r.row)).toEqual([2, 3]);
  });

  it('serialises an empty list as header only', () => {
    expect(toCsv([])).toBe(
      `${BOM}id,title,description,preconditions,steps,expected_result,priority,test_type,module,tags,status,created_at,updated_at\r\n`,
    );
  });
});
