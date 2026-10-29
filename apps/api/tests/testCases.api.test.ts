import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestCase, TestCaseListResponse } from '@qalynks/shared';
import { createCase, createTestApp, sample, type TestApp } from './helpers';

let t: TestApp;

beforeEach(async () => {
  t = createTestApp();
  await t.app.ready();
});
afterEach(async () => {
  await t.app.close();
  t.db.close();
});

describe('create', () => {
  it('persists a test case with a server-generated sequential ID', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/test-cases', payload: sample() });
    expect(res.statusCode).toBe(201);
    const { testCase, duplicates } = res.json() as { testCase: TestCase; duplicates: unknown[] };
    expect(testCase.code).toBe('TC-0001');
    expect(testCase.revision).toBe(1);
    expect(testCase.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(testCase.steps.map((s) => s.position)).toEqual([1, 2]);
    expect(testCase.tags).toEqual(['login', 'smoke']);
    expect(duplicates).toEqual([]);

    const second = await createCase(t.app, { title: 'Another case' });
    expect(second.code).toBe('TC-0002');
  });

  it('ignores a client-supplied ID', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases',
      payload: { ...sample(), code: 'TC-9999' },
    });
    expect((res.json() as { testCase: TestCase }).testCase.code).toBe('TC-0001');
  });

  it('never reuses the ID of a deleted test case', async () => {
    const first = await createCase(t.app);
    await t.app.inject({ method: 'DELETE', url: `/api/test-cases/${first.code}` });
    const next = await createCase(t.app, { title: 'Second' });
    expect(next.code).toBe('TC-0002');
  });

  it('deduplicates tags case-insensitively', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases',
      payload: sample({ tags: ['Login', 'login', 'api'] }),
    });
    expect((created.json() as { testCase: TestCase }).testCase.tags).toEqual(['api', 'Login']);
  });

  it('returns field-level errors for invalid input', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases',
      payload: sample({ title: '   ', priority: 'Urgent' as never }),
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields.title).toBe('Title is required');
    expect(body.error.fields.priority).toBe('Select a priority');
  });

  it('rejects an empty step action and over-long titles', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases',
      payload: sample({ title: 'x'.repeat(201), steps: [{ action: '', expectedResult: '' }] }),
    });
    expect(res.statusCode).toBe(400);
    const fields = (res.json() as { error: { fields: Record<string, string> } }).error.fields;
    expect(fields.title).toContain('200');
    expect(fields['steps.0.action']).toBe('Step action is required');
  });

  it('rejects malformed JSON without leaking internals', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('BAD_REQUEST');
  });

  it('is safe against SQL injection in text fields', async () => {
    const title = "x'); DROP TABLE test_cases;--";
    const created = await createCase(t.app, { title });
    const res = await t.app.inject({ method: 'GET', url: `/api/test-cases/${created.code}` });
    expect((res.json() as TestCase).title).toBe(title);
    const list = await t.app.inject({ method: 'GET', url: '/api/test-cases?q=DROP' });
    expect((list.json() as TestCaseListResponse).filteredTotal).toBe(1);
  });
});

describe('database integrity', () => {
  it('enforces CHECK constraints below the API layer', () => {
    expect(() =>
      t.db
        .prepare(
          `INSERT INTO test_cases (code, title, title_normalized, priority, test_type, status, created_at, updated_at)
           VALUES ('TC-X', 'a', 'a', 'Urgent', 'Smoke', 'Draft', 'n', 'n')`,
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it('enforces unique codes and foreign keys', () => {
    expect(() =>
      t.db
        .prepare('INSERT INTO test_steps (test_case_id, position, action) VALUES (999, 1, ?)')
        .run('orphan'),
    ).toThrow(/FOREIGN KEY/);
  });

  it('rolls back the whole create when a child insert fails', async () => {
    t.db.exec(
      "CREATE TRIGGER fail_tags BEFORE INSERT ON tags BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    const res = await t.app.inject({ method: 'POST', url: '/api/test-cases', payload: sample() });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { error: { message: string } }).error.message).toBe(
      'Something went wrong',
    );
    const count = t.db.prepare('SELECT COUNT(*) AS n FROM test_cases').get() as { n: number };
    expect(count.n).toBe(0);
  });
});

describe('read, update, delete', () => {
  it('retrieves a full test case with ordered steps', async () => {
    const { code } = await createCase(t.app);
    const res = await t.app.inject({ method: 'GET', url: `/api/test-cases/${code}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TestCase;
    expect(body.steps[0]).toEqual({
      position: 1,
      action: 'Open login page',
      expectedResult: 'Form shown',
    });
    expect(body.module).toBe('Auth');
  });

  it('returns 404 for unknown and malformed codes', async () => {
    for (const code of ['TC-0099', 'bad', '1%27%20OR%201=1']) {
      const res = await t.app.inject({ method: 'GET', url: `/api/test-cases/${code}` });
      expect(res.statusCode).toBe(404);
    }
  });

  it('updates fields, preserves ID and createdAt, and bumps updatedAt and revision', async () => {
    const { code } = await createCase(t.app);
    t.setNow('2026-02-01T10:00:00.000Z');
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/test-cases/${code}`,
      payload: sample({
        title: 'Renamed',
        steps: [{ action: 'Only step', expectedResult: 'ok' }],
        tags: ['new'],
        status: 'Deprecated',
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TestCase;
    expect(body.code).toBe(code);
    expect(body.title).toBe('Renamed');
    expect(body.steps).toHaveLength(1);
    expect(body.tags).toEqual(['new']);
    expect(body.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(body.updatedAt).toBe('2026-02-01T10:00:00.000Z');
    expect(body.revision).toBe(2);
  });

  it('validates updates and returns 404 for missing records', async () => {
    const { code } = await createCase(t.app);
    const bad = await t.app.inject({
      method: 'PUT',
      url: `/api/test-cases/${code}`,
      payload: sample({ title: '' }),
    });
    expect(bad.statusCode).toBe(400);
    const missing = await t.app.inject({
      method: 'PUT',
      url: '/api/test-cases/TC-0042',
      payload: sample(),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('soft-deletes: hidden from reads, lists and search but kept in the database', async () => {
    const { code } = await createCase(t.app, { title: 'Findable zebra' });
    const del = await t.app.inject({ method: 'DELETE', url: `/api/test-cases/${code}` });
    expect(del.statusCode).toBe(204);

    expect((await t.app.inject({ method: 'GET', url: `/api/test-cases/${code}` })).statusCode).toBe(
      404,
    );
    const list = (
      await t.app.inject({ method: 'GET', url: '/api/test-cases?q=zebra' })
    ).json() as TestCaseListResponse;
    expect(list.filteredTotal).toBe(0);
    expect(list.total).toBe(0);

    const row = t.db.prepare('SELECT deleted_at FROM test_cases WHERE code = ?').get(code) as {
      deleted_at: string | null;
    };
    expect(row.deleted_at).not.toBeNull();

    expect(
      (await t.app.inject({ method: 'DELETE', url: `/api/test-cases/${code}` })).statusCode,
    ).toBe(404);
    const update = await t.app.inject({
      method: 'PUT',
      url: `/api/test-cases/${code}`,
      payload: sample(),
    });
    expect(update.statusCode).toBe(404);
  });
});

describe('list: search, filters, sorting, pagination', () => {
  beforeEach(async () => {
    t.setNow('2026-01-01T00:00:00.000Z');
    await createCase(t.app, {
      title: 'Alpha login',
      priority: 'Low',
      testType: 'Smoke',
      status: 'Draft',
      module: 'Auth',
    });
    t.setNow('2026-01-02T00:00:00.000Z');
    await createCase(t.app, {
      title: 'Bravo checkout',
      priority: 'Critical',
      testType: 'UI',
      status: 'Ready',
      module: 'Checkout',
    });
    t.setNow('2026-01-03T00:00:00.000Z');
    await createCase(t.app, {
      title: 'Charlie 100% coupon',
      priority: 'High',
      testType: 'Smoke',
      status: 'Ready',
      module: 'checkout',
    });
    t.setNow('2026-01-04T00:00:00.000Z');
    await createCase(t.app, {
      title: 'Delta logout',
      priority: 'Medium',
      testType: 'Security',
      status: 'Deprecated',
      module: '',
    });
  });

  const list = async (qs = '') =>
    (
      await t.app.inject({ method: 'GET', url: `/api/test-cases${qs}` })
    ).json() as TestCaseListResponse;

  it('returns summaries with total and filtered counts', async () => {
    const r = await list();
    expect(r.total).toBe(4);
    expect(r.filteredTotal).toBe(4);
    expect(r.items).toHaveLength(4);
    expect(r.items[0]?.title).toBe('Delta logout');
    expect(Object.keys(r.items[0] ?? {}).sort()).toEqual(
      ['code', 'module', 'priority', 'status', 'testType', 'title', 'updatedAt'].sort(),
    );
  });

  it('searches by title and by ID, case-insensitively', async () => {
    expect((await list('?q=LOG')).items.map((i) => i.title).sort()).toEqual([
      'Alpha login',
      'Delta logout',
    ]);
    expect((await list('?q=tc-0002')).items.map((i) => i.title)).toEqual(['Bravo checkout']);
  });

  it('treats LIKE wildcards in search as literal text', async () => {
    expect((await list('?q=100%25')).items.map((i) => i.title)).toEqual(['Charlie 100% coupon']);
    expect((await list('?q=%25')).filteredTotal).toBe(1);
    expect((await list('?q=_')).filteredTotal).toBe(0);
  });

  it('filters by priority, type, status and module', async () => {
    expect((await list('?priority=Critical')).filteredTotal).toBe(1);
    expect((await list('?testType=Smoke')).filteredTotal).toBe(2);
    expect((await list('?status=Ready')).filteredTotal).toBe(2);
    expect((await list('?module=CHECKOUT')).filteredTotal).toBe(2);
  });

  it('combines search, filters, sorting and pagination', async () => {
    const r = await list(
      '?testType=Smoke&status=Ready&q=char&sort=title&order=asc&page=1&pageSize=1',
    );
    expect(r.filteredTotal).toBe(1);
    expect(r.total).toBe(4);
    expect(r.items.map((i) => i.title)).toEqual(['Charlie 100% coupon']);

    const none = await list('?q=nothing-matches');
    expect(none.filteredTotal).toBe(0);
    expect(none.items).toEqual([]);
    expect(none.total).toBe(4);
  });

  it('sorts by severity for priority, not alphabetically', async () => {
    expect((await list('?sort=priority&order=asc')).items.map((i) => i.priority)).toEqual([
      'Critical',
      'High',
      'Medium',
      'Low',
    ]);
    expect((await list('?sort=priority&order=desc')).items[0]?.priority).toBe('Low');
  });

  it('sorts by title, code and updated date', async () => {
    expect((await list('?sort=title&order=asc')).items[0]?.title).toBe('Alpha login');
    expect((await list('?sort=code&order=desc')).items[0]?.code).toBe('TC-0004');
    expect((await list('?sort=updatedAt&order=asc')).items[0]?.title).toBe('Alpha login');
  });

  it('paginates without overlap and reports page metadata', async () => {
    const p1 = await list('?sort=code&order=asc&pageSize=3&page=1');
    const p2 = await list('?sort=code&order=asc&pageSize=3&page=2');
    expect(p1.items.map((i) => i.code)).toEqual(['TC-0001', 'TC-0002', 'TC-0003']);
    expect(p2.items.map((i) => i.code)).toEqual(['TC-0004']);
    expect(p2).toMatchObject({ page: 2, pageSize: 3, filteredTotal: 4 });
    expect((await list('?page=9')).items).toEqual([]);
  });

  it('rejects invalid query parameters', async () => {
    for (const qs of ['?pageSize=500', '?page=0', '?sort=password', '?priority=Urgent']) {
      const res = await t.app.inject({ method: 'GET', url: `/api/test-cases${qs}` });
      expect(res.statusCode).toBe(400);
    }
  });

  it('lists distinct modules', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/modules' });
    expect((res.json() as { modules: string[] }).modules).toEqual(['Auth', 'Checkout', 'checkout']);
  });
});

describe('duplicate detection', () => {
  it('warns on create when a normalised title matches, flagging same-module matches', async () => {
    const original = await createCase(t.app, { title: 'Reset password', module: 'Auth' });
    await createCase(t.app, { title: 'Reset Password!', module: 'Profile' });

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases',
      payload: sample({ title: '  reset   password ', module: 'auth' }),
    });
    expect(res.statusCode).toBe(201);
    const { duplicates } = res.json() as { duplicates: { code: string; sameModule: boolean }[] };
    expect(duplicates).toHaveLength(2);
    expect(duplicates[0]).toMatchObject({ code: original.code, sameModule: true });
    expect(duplicates[1]?.sameModule).toBe(false);
  });

  it('exposes a check endpoint that can exclude the record being edited', async () => {
    const a = await createCase(t.app, { title: 'Same title', module: 'X' });
    const check = async (payload: object) =>
      (
        (
          await t.app.inject({ method: 'POST', url: '/api/test-cases/duplicates', payload })
        ).json() as {
          duplicates: unknown[];
        }
      ).duplicates;
    expect(await check({ title: 'same TITLE', module: 'X' })).toHaveLength(1);
    expect(await check({ title: 'same TITLE', module: 'X', excludeCode: a.code })).toHaveLength(0);
    expect(await check({ title: 'different' })).toHaveLength(0);
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases/duplicates',
      payload: {},
    });
    expect(bad.statusCode).toBe(400);
  });

  it('does not report soft-deleted records as duplicates', async () => {
    const a = await createCase(t.app, { title: 'Gone soon' });
    await t.app.inject({ method: 'DELETE', url: `/api/test-cases/${a.code}` });
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/test-cases/duplicates',
      payload: { title: 'Gone soon' },
    });
    expect((res.json() as { duplicates: unknown[] }).duplicates).toEqual([]);
  });
});

describe('platform behaviour', () => {
  it('reports health and summary counts', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({
      status: 'ok',
    });
    await createCase(t.app, { priority: 'Critical', testType: 'Security', status: 'Draft' });
    const s = (await t.app.inject({ method: 'GET', url: '/api/summary' })).json() as {
      total: number;
      byStatus: Record<string, number>;
      byPriority: Record<string, number>;
      byType: Record<string, number>;
      recent: unknown[];
    };
    expect(s.total).toBe(1);
    expect(s.byStatus).toMatchObject({ Draft: 1, Ready: 0, Deprecated: 0 });
    expect(s.byPriority.Critical).toBe(1);
    expect(s.byType.Security).toBe(1);
    expect(s.recent).toHaveLength(1);
  });

  it('returns a JSON 404 for unknown routes and sets security headers', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
