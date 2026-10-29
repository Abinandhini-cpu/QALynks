import {
  normalizeText,
  type CreateTestCaseResponse,
  type DuplicateCheckInput,
  type DuplicateMatch,
  type ImportResult,
  type ListQuery,
  type SummaryResponse,
  type TestCase,
  type TestCaseInput,
  type TestCaseListResponse,
} from '@qalynks/shared';
import type { Db } from '../db/connection';
import { NotFoundError } from '../errors';
import type { Filters, Sorting, TestCaseRepository } from '../repositories/testCaseRepository';
import { parseCsv, toCsv } from './csv';

const EXPORT_LIMIT = 5000;

export class TestCaseService {
  constructor(
    private readonly repo: TestCaseRepository,
    private readonly db: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private now(): string {
    return this.clock().toISOString();
  }

  create(input: TestCaseInput): CreateTestCaseResponse {
    const duplicates = this.repo.findDuplicates(input.title, input.module);
    const testCase = this.repo.create(input, this.now());
    return { testCase, duplicates };
  }

  get(code: string): TestCase {
    const found = this.repo.findByCode(code);
    if (!found) throw new NotFoundError();
    return found;
  }

  update(code: string, input: TestCaseInput): TestCase {
    const updated = this.repo.update(code, input, this.now());
    if (!updated) throw new NotFoundError();
    return updated;
  }

  remove(code: string): void {
    if (!this.repo.softDelete(code, this.now())) throw new NotFoundError();
  }

  list(query: ListQuery): TestCaseListResponse {
    const { items, filteredTotal } = this.repo.list(query);
    return {
      items,
      total: this.repo.count(),
      filteredTotal,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  modules(): string[] {
    return this.repo.modules();
  }

  summary(): SummaryResponse {
    return this.repo.summary();
  }

  checkDuplicates(input: DuplicateCheckInput): DuplicateMatch[] {
    return this.repo.findDuplicates(input.title, input.module, input.excludeCode);
  }

  exportCsv(filters: Filters, sorting: Sorting): string {
    return toCsv(this.repo.listAll(filters, sorting, EXPORT_LIMIT));
  }

  /**
   * Imports valid, non-duplicate rows in one transaction. Invalid rows and
   * duplicates are reported, never silently dropped or merged.
   */
  importCsv(text: string): ImportResult {
    const rows = parseCsv(text);
    const result: ImportResult = {
      totalRows: rows.length,
      created: [],
      skippedDuplicates: [],
      failed: [],
    };
    const seenInFile = new Map<string, number>();

    this.db.transaction(() => {
      for (const parsed of rows) {
        if (!parsed.input) {
          result.failed.push({ row: parsed.row, errors: parsed.errors ?? {} });
          continue;
        }
        const { input } = parsed;
        const key = `${normalizeText(input.title)}|${normalizeText(input.module)}`;
        const earlierRow = seenInFile.get(key);
        if (earlierRow !== undefined) {
          result.skippedDuplicates.push({
            row: parsed.row,
            title: input.title,
            duplicateOf: `row ${earlierRow}`,
          });
          continue;
        }
        const existing = this.repo
          .findDuplicates(input.title, input.module)
          .find((d) => d.sameModule);
        if (existing) {
          seenInFile.set(key, parsed.row);
          result.skippedDuplicates.push({
            row: parsed.row,
            title: input.title,
            duplicateOf: existing.code,
          });
          continue;
        }
        seenInFile.set(key, parsed.row);
        const created = this.repo.create(input, this.now());
        result.created.push({ row: parsed.row, code: created.code });
      }
    })();

    return result;
  }
}
