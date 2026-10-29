import fs from 'node:fs';
import { loadConfig } from '../config';
import { TestCaseRepository } from '../repositories/testCaseRepository';
import { seedSampleData } from '../seed';
import { TestCaseService } from '../services/testCaseService';
import { openDatabase } from './connection';
import { runMigrations } from './migrate';

function loadDotEnv(): void {
  try {
    process.loadEnvFile(new URL('../../../../.env', import.meta.url));
  } catch {
    // No .env file; defaults apply.
  }
}

function removeDatabaseFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
}

function main(): void {
  loadDotEnv();
  const command = process.argv[2];
  const config = loadConfig();

  if (command === 'reset') {
    if (config.databasePath === ':memory:') throw new Error('Nothing to reset for :memory:');
    removeDatabaseFiles(config.databasePath);
    console.log(`Removed ${config.databasePath}`);
  }
  if (!['migrate', 'seed', 'reset'].includes(command ?? '')) {
    console.error('Usage: cli.ts <migrate|seed|reset>');
    process.exit(1);
  }

  const db = openDatabase(config.databasePath);
  const ran = runMigrations(db, config.migrationsDir);
  console.log(ran.length > 0 ? `Applied migrations: ${ran.join(', ')}` : 'Database is up to date');

  if (command === 'seed' || command === 'reset') {
    const service = new TestCaseService(new TestCaseRepository(db), db);
    const count = seedSampleData(service);
    console.log(count > 0 ? `Seeded ${count} sample test cases` : 'Skipped seeding: data exists');
  }
  db.close();
}

main();
