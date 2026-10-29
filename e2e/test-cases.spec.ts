import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const unique = () => `E2E ${Date.now()}`;

test('create, view, edit, search, export and delete a test case', async ({ page }) => {
  const title = unique();
  await page.goto('/test-cases');
  await expect(page.getByRole('heading', { name: 'Test Cases', level: 1 })).toBeVisible();

  // Create
  await page.getByRole('link', { name: 'New test case' }).click();
  await page.getByRole('button', { name: 'Create test case' }).click();
  await expect(page.getByRole('alert').first()).toContainText('Title is required');

  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel('Module or component').fill('E2E Module');
  await page.getByLabel('Tags').fill('e2e,regression');
  await page.getByLabel('Tags').press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag regression' })).toBeVisible();
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel(/^Step 1 action/).fill('Open the app');
  await page.getByLabel(/^Step 1 expected result/).fill('The app loads');
  await page.getByLabel(/^Priority/).selectOption('Critical');
  await page.getByLabel(/^Status/).selectOption('Ready');
  await page.getByRole('button', { name: 'Create test case' }).click();

  // View
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Open the app')).toBeVisible();
  await expect(page.getByText('Expected: The app loads')).toBeVisible();
  await expect(page.getByText('e2e', { exact: true })).toBeVisible();

  // Edit keeps the ID
  const code = (await page.locator('.subtitle').first().textContent())?.trim() ?? '';
  expect(code).toMatch(/^TC-\d{4}$/);
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel(/^Title/).fill(`${title} edited`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: `${title} edited`, level: 1 })).toBeVisible();
  await expect(page.locator('.subtitle').first()).toHaveText(code);

  // Search and filter
  await page.goto('/test-cases');
  await page.getByLabel('Search by ID or title').fill(`${title} edited`);
  await expect(page.getByRole('link', { name: `${title} edited` })).toBeVisible();
  await expect(page.getByText(/^1 of \d+ test cases$/)).toBeVisible();
  await page.getByLabel('Priority').selectOption('Low');
  await expect(page.getByText('No test cases match your search')).toBeVisible();
  await page.getByLabel('Priority').selectOption('Critical');
  await expect(page.getByRole('link', { name: `${title} edited` })).toBeVisible();

  // Export the filtered set
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export CSV' }).click(),
  ]);
  const text = fs.readFileSync(await download.path(), 'utf8');
  expect(text).toContain(`${title} edited`);
  expect(text).not.toContain('Login with valid credentials');

  // Delete needs confirmation
  await page.getByRole('button', { name: `Delete ${code}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('link', { name: `${title} edited` })).toBeVisible();
  await page.getByRole('button', { name: `Delete ${code}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete test case' }).click();
  await expect(page.getByText(`Deleted ${code}`)).toBeVisible();
  await expect(page.getByRole('link', { name: `${title} edited` })).toHaveCount(0);
});

test('warns about a likely duplicate before saving', async ({ page }) => {
  await page.goto('/test-cases/new');
  await page.getByLabel(/^Title/).fill('login with valid credentials');
  await page.getByLabel('Module or component').fill('Authentication');
  await page.getByRole('button', { name: 'Create test case' }).click();
  await expect(page.getByText('Possible duplicate')).toBeVisible();
  await expect(page.getByText('same module')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByText('Possible duplicate')).toHaveCount(0);
});

test('imports valid rows and reports invalid and duplicate rows', async ({ page }) => {
  const title = unique();
  const csv = [
    'title,priority,test_type,status,module,tags,steps',
    `${title},High,Smoke,Ready,Import,imported;e2e,Open page :: Page opens`,
    ',High,Smoke,Ready,,,',
    'Login with valid credentials,High,Smoke,Ready,Authentication,,',
  ].join('\r\n');

  await page.goto('/test-cases/import');
  await page.getByLabel(/CSV file/).setInputFiles({
    name: 'import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: 'Import' }).click();

  const results = page.getByRole('region', { name: 'Import results' });
  await expect(results).toContainText('1 created');
  await expect(results).toContainText('1 skipped as duplicates');
  await expect(results).toContainText('1 failed');
  await expect(results).toContainText('Title is required');

  await page.goto('/test-cases');
  await page.getByLabel('Search by ID or title').fill(title);
  await expect(page.getByRole('link', { name: title })).toBeVisible();
});

test('shell shows planned modules as unavailable and the dashboard loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByText('Total test cases')).toBeVisible();
  await expect(page.getByRole('link', { name: /Requirements/ })).toHaveCount(0);
  await expect(page.locator('[aria-disabled="true"]', { hasText: 'Requirements' })).toBeVisible();
});
