import { expect, test } from '@playwright/test';

test('loads the demo sample through the worker', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Demo engine run' }).click();
  await expect(page.getByRole('banner')).toContainText('9,600 rows');
  await expect(page.getByTestId('channel-row').filter({ hasText: 'Engine Speed' })).toBeVisible();
});

test('reads units and falls back to row numbers for the real-world export', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Open log').setInputFiles('tests/fixtures/autodata-sheet2.csv');
  await expect(page.getByText('No time column found')).toBeVisible();
  await expect(
    page.getByTestId('channel-row').filter({ hasText: 'Accelerator Position' }),
  ).toContainText('°TPS');
});

test('shows a helpful error for a file with no numbers', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Open log').setInputFiles({
    name: 'names.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,colour\nfoo,red\nbar,blue\n'),
  });
  await expect(page.getByRole('alert')).toContainText('No numeric columns');
});
