import { expect, test } from '@playwright/test';

/**
 * Runs against the built-in mock provider (AI_PROVIDER=mock in playwright.config.ts).
 * This verifies the review and save workflow only. It does not exercise a live AI model.
 */
const REQUIREMENT =
  'As a registered user I can sign in with my email and password. Wrong passwords show an error.';

test('analyse, review, edit, remove and save only approved test cases', async ({ page }) => {
  await page.goto('/test-cases/generate');
  await expect(page.getByText('Test provider active')).toBeVisible();

  await page.getByLabel('Requirement text').fill(REQUIREMENT);
  await page.getByRole('button', { name: 'Analyse and generate' }).click();

  // Analysis and the seven-column table appear from one submission
  await expect(page.getByRole('region', { name: 'Requirement analysis' })).toContainText(
    'The requirement does not state a lockout rule',
  );
  const table = page.getByRole('table', { name: 'Generated test cases for review' });
  await expect(table.getByRole('columnheader')).toHaveText([
    'TC ID',
    'Module',
    'Summary',
    'Steps',
    'Test Data',
    'Expected Result',
    'Actual Result',
  ]);
  await expect(page.getByText('Module needs review')).toBeVisible();
  await expect(page.getByText(/Needs clarification: No lockout rule/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save 0 approved' })).toBeDisabled();

  // Edit one case, remove another, approve two
  const stamp = Date.now();
  await page.getByRole('button', { name: 'Edit: Sign in with a wrong password' }).click();
  await page.getByLabel('Summary').fill(`Wrong password ${stamp}`);
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await page
    .getByRole('button', { name: 'Remove: Account behaviour after repeated failed sign-ins' })
    .click();
  await expect(page.getByText('Review generated test cases (2 remaining)')).toBeVisible();

  await page.getByRole('checkbox', { name: `Approve: Wrong password ${stamp}` }).check();
  await page.getByRole('checkbox', { name: 'Approve: Sign in with valid credentials' }).check();
  await page.getByRole('button', { name: 'Save 2 approved' }).click();

  // Saved cases show real IDs and a blank Actual Result
  const saved = page.getByRole('region', { name: 'Saved test cases' });
  await expect(saved).toContainText(`Wrong password ${stamp}`);
  const codes = await saved.getByRole('link', { name: /^TC-\d{4}$/ }).allTextContents();
  expect(codes).toHaveLength(2);
  expect(new Set(codes).size).toBe(2);

  // They appear in the normal list; the removed case was never saved
  await page.goto('/test-cases');
  await page.getByLabel('Search by ID or title').fill(`Wrong password ${stamp}`);
  await expect(page.getByRole('link', { name: `Wrong password ${stamp}` })).toBeVisible();
  await page.getByLabel('Search by ID or title').fill('repeated failed sign-ins');
  await expect(page.getByText('No test cases match your search')).toBeVisible();

  // The saved case opens in the existing detail page with the new fields
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await page.getByLabel('Search by ID or title').fill(`Wrong password ${stamp}`);
  await page.getByRole('link', { name: `Wrong password ${stamp}` }).click();
  await expect(page.getByText('ai-generated')).toBeVisible();
  await expect(page.getByText('[Not specified: registered email]', { exact: false })).toBeVisible();
});

test('manual creation still works and shows the new fields', async ({ page }) => {
  const title = `Manual with test data ${Date.now()}`;
  await page.goto('/test-cases/new');
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel('Test data').fill('Order 42');
  await page.getByRole('button', { name: 'Create test case' }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Order 42')).toBeVisible();
});
