import { parse } from 'csv-parse/sync';
import { LIMITS, testCaseInputSchema, type TestCase, type TestCaseInput } from '@qalynks/shared';
import { ValidationError } from '../errors';

export const EXPORT_COLUMNS = [
  'id',
  'title',
  'description',
  'preconditions',
  'steps',
  'expected_result',
  'priority',
  'test_type',
  'module',
  'tags',
  'status',
  'created_at',
  'updated_at',
] as const;

export const REQUIRED_COLUMNS = ['title', 'priority', 'test_type', 'status'] as const;
const OPTIONAL_COLUMNS = [
  'description',
  'preconditions',
  'steps',
  'expected_result',
  'module',
  'tags',
] as const;

/** Byte order mark so Excel opens the UTF-8 export correctly. */
export const BOM = String.fromCharCode(0xfeff);
const BOM_PATTERN = new RegExp(`^${BOM}`);
const STEP_SEPARATOR = ' :: ';
const FORMULA_START = /^[\t\r]|^\s*[=+\-@]/;

/**
 * Neutralises spreadsheet formulas by prefixing a single quote, then applies
 * RFC 4180 quoting.
 */
export function escapeCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Reverses `escapeCell` formula protection so exported files re-import cleanly. */
function unescapeCell(value: string): string {
  return value.replace(/^'(\s*[=+\-@])/, '$1');
}

function encodeSteps(testCase: TestCase): string {
  const flat = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ');
  return testCase.steps
    .map((s) =>
      s.expectedResult
        ? `${flat(s.action)}${STEP_SEPARATOR}${flat(s.expectedResult)}`
        : flat(s.action),
    )
    .join('\n');
}

export function toCsv(cases: TestCase[]): string {
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const c of cases) {
    const cells = [
      c.code,
      c.title,
      c.description,
      c.preconditions,
      encodeSteps(c),
      c.expectedResult,
      c.priority,
      c.testType,
      c.module,
      c.tags.join(';'),
      c.status,
      c.createdAt,
      c.updatedAt,
    ];
    lines.push(cells.map(escapeCell).join(','));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export interface ParsedRow {
  /** Spreadsheet row number; the header is row 1. */
  row: number;
  input?: TestCaseInput;
  errors?: Record<string, string>;
}

function decodeSteps(cell: string): { action: string; expectedResult: string }[] {
  return cell
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const at = line.indexOf(STEP_SEPARATOR);
      return at === -1
        ? { action: line, expectedResult: '' }
        : {
            action: line.slice(0, at),
            expectedResult: line.slice(at + STEP_SEPARATOR.length),
          };
    });
}

const FIELD_TO_COLUMN: Record<string, string> = {
  title: 'title',
  description: 'description',
  preconditions: 'preconditions',
  steps: 'steps',
  expectedResult: 'expected_result',
  priority: 'priority',
  testType: 'test_type',
  module: 'module',
  tags: 'tags',
  status: 'status',
};

function normalizeHeader(header: string): string {
  return header
    .replace(BOM_PATTERN, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function parseCsv(text: string): ParsedRow[] {
  if (text.trim() === '') throw new ValidationError('The CSV file is empty');

  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unreadable content';
    throw new ValidationError(`Malformed CSV: ${detail}`);
  }

  const [headerRow, ...dataRows] = records;
  if (!headerRow) throw new ValidationError('The CSV file has no header row');
  const headers = headerRow.map(normalizeHeader);

  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new ValidationError(`Missing required column(s): ${missing.join(', ')}`);
  }
  if (dataRows.length === 0) throw new ValidationError('The CSV file has no data rows');
  if (dataRows.length > LIMITS.maxImportRows) {
    throw new ValidationError(`Too many rows. The limit is ${LIMITS.maxImportRows} per import`);
  }

  const known = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

  return dataRows.map((cells, index): ParsedRow => {
    const row = index + 2;
    if (cells.length > headers.length) {
      return { row, errors: { _row: 'Row has more values than the header has columns' } };
    }
    const values: Record<string, string> = {};
    headers.forEach((header, i) => {
      if (known.has(header)) values[header] = unescapeCell(cells[i] ?? '');
    });

    const candidate = {
      title: values.title ?? '',
      description: values.description ?? '',
      preconditions: values.preconditions ?? '',
      steps: decodeSteps(values.steps ?? ''),
      expectedResult: values.expected_result ?? '',
      priority: values.priority?.trim(),
      testType: values.test_type?.trim(),
      module: values.module ?? '',
      tags: (values.tags ?? '')
        .split(/[;,]/)
        .map((t) => t.trim())
        .filter(Boolean),
      status: values.status?.trim(),
    };

    const result = testCaseInputSchema.safeParse(candidate);
    if (result.success) return { row, input: result.data };

    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? '_row');
      const column = FIELD_TO_COLUMN[field] ?? field;
      errors[column] ??= issue.message;
    }
    return { row, errors };
  });
}
