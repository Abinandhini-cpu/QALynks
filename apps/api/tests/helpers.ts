import type { FastifyInstance } from 'fastify';
import type { TestCaseInput } from '@qalynks/shared';
import { buildApp, type AppOptions } from '../src/app';
import { loadConfig } from '../src/config';
import { openDatabase, type Db } from '../src/db/connection';
import { runMigrations } from '../src/db/migrate';

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  setNow: (iso: string) => void;
}

export function createTestApp(options: Partial<AppOptions> = {}): TestApp {
  const db = openDatabase(':memory:');
  runMigrations(db, loadConfig().migrationsDir);
  let now = new Date('2026-01-01T00:00:00.000Z');
  const app = buildApp({ db, clock: () => now, ...options });
  return { app, db, setNow: (iso) => (now = new Date(iso)) };
}

export function sample(overrides: Partial<TestCaseInput> = {}): TestCaseInput {
  return {
    title: 'Login with valid credentials',
    description: 'Happy path',
    preconditions: 'User exists',
    testData: 'Email: user@example.test',
    actualResult: '',
    steps: [
      { action: 'Open login page', expectedResult: 'Form shown' },
      { action: 'Submit credentials', expectedResult: '' },
    ],
    expectedResult: 'User is signed in',
    priority: 'High',
    testType: 'Functional',
    module: 'Auth',
    tags: ['login', 'smoke'],
    status: 'Ready',
    ...overrides,
  };
}

export async function createCase(
  app: FastifyInstance,
  overrides: Partial<TestCaseInput> = {},
): Promise<{ code: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/test-cases',
    payload: sample(overrides),
  });
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
  return (res.json() as { testCase: { code: string } }).testCase;
}
