import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { openDatabase } from '../src/db/connection';
import { runMigrations } from '../src/db/migrate';
import { TestCaseRepository } from '../src/repositories/testCaseRepository';
import { SAMPLE_TEST_CASES, seedSampleData } from '../src/seed';
import { TestCaseService } from '../src/services/testCaseService';
import { createTestApp } from './helpers';

describe('loadConfig', () => {
  it('uses safe local defaults', () => {
    const c = loadConfig({});
    expect(c.port).toBe(3001);
    expect(c.host).toBe('127.0.0.1');
    expect(c.databasePath.replace(/\\/g, '/')).toMatch(/apps\/api\/data\/qalynks\.db$/);
  });

  it('reads overrides from the environment', () => {
    const c = loadConfig({
      PORT: '4000',
      HOST: '0.0.0.0',
      DATABASE_PATH: ':memory:',
      LOG_LEVEL: 'silent',
    });
    expect(c).toMatchObject({
      port: 4000,
      host: '0.0.0.0',
      databasePath: ':memory:',
      logLevel: 'silent',
    });
  });
});

describe('migrations', () => {
  it('apply once and are idempotent', () => {
    const db = openDatabase(':memory:');
    const dir = loadConfig().migrationsDir;
    expect(runMigrations(db, dir)).toEqual(['001_init.sql']);
    expect(runMigrations(db, dir)).toEqual([]);
    db.close();
  });
});

describe('persistence across restarts', () => {
  it('keeps data in the database file after the connection closes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qalynks-'));
    const file = path.join(dir, 'test.db');
    try {
      const first = openDatabase(file);
      runMigrations(first, loadConfig().migrationsDir);
      const service = new TestCaseService(new TestCaseRepository(first), first);
      service.create(SAMPLE_TEST_CASES[0]!);
      first.close();

      const second = openDatabase(file);
      runMigrations(second, loadConfig().migrationsDir);
      const reopened = new TestCaseService(new TestCaseRepository(second), second);
      expect(reopened.get('TC-0001').title).toBe(SAMPLE_TEST_CASES[0]!.title);
      expect(reopened.create(SAMPLE_TEST_CASES[1]!).testCase.code).toBe('TC-0002');
      second.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('seed data', () => {
  it('seeds sample cases once and passes validation', async () => {
    const t = createTestApp();
    const service = new TestCaseService(new TestCaseRepository(t.db), t.db);
    expect(seedSampleData(service)).toBe(SAMPLE_TEST_CASES.length);
    expect(seedSampleData(service)).toBe(0);
    expect(service.summary().total).toBe(SAMPLE_TEST_CASES.length);
    await t.app.close();
    t.db.close();
  });
});
