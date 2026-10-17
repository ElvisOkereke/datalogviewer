import { expect, test } from '@playwright/test';

test('loads the demo sample through the worker', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Demo engine run' }).click();
  await expect(page.getByTestId('row-count')).toHaveText('9,600');
  await expect(page.getByTestId('time-source')).toHaveText('Time (seconds)');
  await expect(page.getByRole('cell', { name: 'Engine Speed', exact: true })).toBeVisible();
});

test('reads units and falls back to row numbers for the real-world export', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Open log').setInputFiles('tests/fixtures/autodata-sheet2.csv');
  await expect(page.getByTestId('time-source')).toHaveText('Row number');
  await expect(page.getByRole('row', { name: /Accelerator Position.*°TPS/ })).toBeVisible();
  await expect(page.getByText('No time column found')).toBeVisible();
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
