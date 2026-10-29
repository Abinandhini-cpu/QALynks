import {
  normalizeText,
  PRIORITIES,
  STATUSES,
  TEST_TYPES,
  type DuplicateMatch,
  type ListQuery,
  type Priority,
  type Status,
  type SummaryResponse,
  type TestCase,
  type TestCaseInput,
  type TestCaseSummary,
  type TestType,
} from '@qalynks/shared';
import type { Db } from '../db/connection';

export type Filters = Pick<ListQuery, 'q' | 'priority' | 'testType' | 'status' | 'module'>;
export type Sorting = Pick<ListQuery, 'sort' | 'order'>;

interface TestCaseRow {
  id: number;
  code: string;
  title: string;
  description: string;
  preconditions: string;
  test_data: string;
  expected_result: string;
  actual_result: string;
  priority: Priority;
  test_type: TestType;
  module: string;
  status: Status;
  revision: number;
  created_at: string;
  updated_at: string;
}

const SORT_SQL: Record<ListQuery['sort'], string> = {
  code: 'CAST(substr(code, 4) AS INTEGER)',
  title: 'title COLLATE NOCASE',
  module: 'module COLLATE NOCASE',
  priority:
    "CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END",
  testType: 'test_type',
  status: 'status',
  updatedAt: 'updated_at',
};

const SUMMARY_COLUMNS = 'code, title, module, priority, test_type, status, updated_at';

function toSummary(row: Record<string, unknown>): TestCaseSummary {
  return {
    code: row.code as string,
    title: row.title as string,
    module: row.module as string,
    priority: row.priority as Priority,
    testType: row.test_type as TestType,
    status: row.status as Status,
    updatedAt: row.updated_at as string,
  };
}

function buildWhere(filters: Filters): { sql: string; params: unknown[] } {
  const clauses = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    clauses.push("(code LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  if (filters.priority) {
    clauses.push('priority = ?');
    params.push(filters.priority);
  }
  if (filters.testType) {
    clauses.push('test_type = ?');
    params.push(filters.testType);
  }
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.module) {
    clauses.push('module = ? COLLATE NOCASE');
    params.push(filters.module);
  }
  return { sql: clauses.join(' AND '), params };
}

function orderBy(sorting: Sorting): string {
  const dir = sorting.order === 'asc' ? 'ASC' : 'DESC';
  return `${SORT_SQL[sorting.sort]} ${dir}, id ${dir}`;
}

export class TestCaseRepository {
  constructor(private readonly db: Db) {}

  create(input: TestCaseInput, now: string): TestCase {
    const id = this.db.transaction(() => {
      const next = this.db
        .prepare("UPDATE sequences SET value = value + 1 WHERE name = 'test_case' RETURNING value")
        .get() as { value: number };
      const code = `TC-${String(next.value).padStart(4, '0')}`;
      const result = this.db
        .prepare(
          `INSERT INTO test_cases
             (code, title, title_normalized, description, preconditions, test_data, expected_result,
              actual_result, priority, test_type, module, module_normalized, status, revision,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          code,
          input.title,
          normalizeText(input.title),
          input.description,
          input.preconditions,
          input.testData,
          input.expectedResult,
          input.actualResult,
          input.priority,
          input.testType,
          input.module,
          normalizeText(input.module),
          input.status,
          now,
          now,
        );
      const rowId = Number(result.lastInsertRowid);
      this.writeChildren(rowId, input);
      return rowId;
    })();
    return this.loadById(id) as TestCase;
  }

  update(code: string, input: TestCaseInput, now: string): TestCase | undefined {
    const id = this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT id FROM test_cases WHERE code = ? AND deleted_at IS NULL')
        .get(code) as { id: number } | undefined;
      if (!existing) return undefined;
      this.db
        .prepare(
          `UPDATE test_cases SET
             title = ?, title_normalized = ?, description = ?, preconditions = ?,
             test_data = ?, expected_result = ?, actual_result = ?, priority = ?,
             test_type = ?, module = ?, module_normalized = ?, status = ?,
             revision = revision + 1, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.title,
          normalizeText(input.title),
          input.description,
          input.preconditions,
          input.testData,
          input.expectedResult,
          input.actualResult,
          input.priority,
          input.testType,
          input.module,
          normalizeText(input.module),
          input.status,
          now,
          existing.id,
        );
      this.db.prepare('DELETE FROM test_steps WHERE test_case_id = ?').run(existing.id);
      this.db.prepare('DELETE FROM test_case_tags WHERE test_case_id = ?').run(existing.id);
      this.writeChildren(existing.id, input);
      return existing.id;
    })();
    return id === undefined ? undefined : this.loadById(id);
  }

  /** Soft delete: the row stays for audit and future restore, and its code is never reused. */
  softDelete(code: string, now: string): boolean {
    const result = this.db
      .prepare(
        'UPDATE test_cases SET deleted_at = ?, updated_at = ? WHERE code = ? AND deleted_at IS NULL',
      )
      .run(now, now, code);
    return result.changes > 0;
  }

  findByCode(code: string): TestCase | undefined {
    const row = this.db
      .prepare('SELECT id FROM test_cases WHERE code = ? AND deleted_at IS NULL')
      .get(code) as { id: number } | undefined;
    return row ? this.loadById(row.id) : undefined;
  }

  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM test_cases WHERE deleted_at IS NULL')
      .get() as { n: number };
    return row.n;
  }

  list(query: ListQuery): { items: TestCaseSummary[]; filteredTotal: number } {
    const where = buildWhere(query);
    const filtered = this.db
      .prepare(`SELECT COUNT(*) AS n FROM test_cases WHERE ${where.sql}`)
      .get(...where.params) as { n: number };
    const rows = this.db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM test_cases WHERE ${where.sql}
         ORDER BY ${orderBy(query)} LIMIT ? OFFSET ?`,
      )
      .all(...where.params, query.pageSize, (query.page - 1) * query.pageSize);
    return {
      items: (rows as Record<string, unknown>[]).map(toSummary),
      filteredTotal: filtered.n,
    };
  }

  /** Full records for every test case matching the filters, for export. */
  listAll(filters: Filters, sorting: Sorting, limit: number): TestCase[] {
    const where = buildWhere(filters);
    const rows = this.db
      .prepare(`SELECT id FROM test_cases WHERE ${where.sql} ORDER BY ${orderBy(sorting)} LIMIT ?`)
      .all(...where.params, limit) as { id: number }[];
    return this.loadMany(rows.map((r) => r.id));
  }

  modules(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT module FROM test_cases
         WHERE deleted_at IS NULL AND module <> '' ORDER BY module COLLATE NOCASE`,
      )
      .all() as { module: string }[];
    return rows.map((r) => r.module);
  }

  findDuplicates(title: string, module: string, excludeCode?: string): DuplicateMatch[] {
    const titleNormalized = normalizeText(title);
    if (!titleNormalized) return [];
    const moduleNormalized = normalizeText(module);
    const rows = this.db
      .prepare(
        `SELECT code, title, module, module_normalized FROM test_cases
         WHERE deleted_at IS NULL AND title_normalized = ? AND code <> ?
         ORDER BY id LIMIT 10`,
      )
      .all(titleNormalized, excludeCode ?? '') as {
      code: string;
      title: string;
      module: string;
      module_normalized: string;
    }[];
    return rows
      .map((r) => ({
        code: r.code,
        title: r.title,
        module: r.module,
        sameModule: r.module_normalized === moduleNormalized,
      }))
      .sort((a, b) => Number(b.sameModule) - Number(a.sameModule));
  }

  summary(): SummaryResponse {
    const group = (column: string) =>
      this.db
        .prepare(
          `SELECT ${column} AS k, COUNT(*) AS n FROM test_cases WHERE deleted_at IS NULL GROUP BY ${column}`,
        )
        .all() as { k: string; n: number }[];
    const fill = <T extends string>(keys: readonly T[], rows: { k: string; n: number }[]) =>
      Object.fromEntries(keys.map((k) => [k, rows.find((r) => r.k === k)?.n ?? 0])) as Record<
        T,
        number
      >;
    const recent = this.db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM test_cases WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, id DESC LIMIT 5`,
      )
      .all() as Record<string, unknown>[];
    return {
      total: this.count(),
      byStatus: fill(STATUSES, group('status')),
      byPriority: fill(PRIORITIES, group('priority')),
      byType: fill(TEST_TYPES, group('test_type')),
      recent: recent.map(toSummary),
    };
  }

  private writeChildren(testCaseId: number, input: TestCaseInput): void {
    const insertStep = this.db.prepare(
      'INSERT INTO test_steps (test_case_id, position, action, expected_result) VALUES (?, ?, ?, ?)',
    );
    input.steps.forEach((step, index) =>
      insertStep.run(testCaseId, index + 1, step.action, step.expectedResult),
    );

    const seen = new Set<string>();
    const upsertTag = this.db.prepare(
      'INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO NOTHING',
    );
    const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?');
    const link = this.db.prepare('INSERT INTO test_case_tags (test_case_id, tag_id) VALUES (?, ?)');
    for (const tag of input.tags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      upsertTag.run(tag);
      const row = findTag.get(tag) as { id: number };
      link.run(testCaseId, row.id);
    }
  }

  private loadById(id: number): TestCase | undefined {
    return this.loadMany([id])[0];
  }

  private loadMany(ids: number[]): TestCase[] {
    const result: TestCase[] = [];
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const marks = chunk.map(() => '?').join(',');
      const rows = this.db
        .prepare(`SELECT * FROM test_cases WHERE id IN (${marks})`)
        .all(...chunk) as TestCaseRow[];
      const steps = this.db
        .prepare(
          `SELECT test_case_id, position, action, expected_result FROM test_steps
           WHERE test_case_id IN (${marks}) ORDER BY test_case_id, position`,
        )
        .all(...chunk) as {
        test_case_id: number;
        position: number;
        action: string;
        expected_result: string;
      }[];
      const tags = this.db
        .prepare(
          `SELECT ctt.test_case_id, t.name FROM test_case_tags ctt
           JOIN tags t ON t.id = ctt.tag_id
           WHERE ctt.test_case_id IN (${marks}) ORDER BY t.name COLLATE NOCASE`,
        )
        .all(...chunk) as { test_case_id: number; name: string }[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const id of chunk) {
        const row = byId.get(id);
        if (!row) continue;
        result.push({
          code: row.code,
          title: row.title,
          description: row.description,
          preconditions: row.preconditions,
          testData: row.test_data,
          steps: steps
            .filter((s) => s.test_case_id === id)
            .map((s) => ({
              position: s.position,
              action: s.action,
              expectedResult: s.expected_result,
            })),
          expectedResult: row.expected_result,
          actualResult: row.actual_result,
          priority: row.priority,
          testType: row.test_type,
          module: row.module,
          tags: tags.filter((t) => t.test_case_id === id).map((t) => t.name),
          status: row.status,
          revision: row.revision,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
    }
    return result;
  }
}
