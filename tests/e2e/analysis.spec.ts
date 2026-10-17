import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function loadDemo(page: Page, { clear = true } = {}) {
  await page.goto('./');
  if (clear) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.getByRole('button', { name: 'Demo engine run' }).click();
  await expect(page.getByTestId('chart-pane')).toHaveCount(2);
}

async function hoverPlot(page: Page, fx: number) {
  const box = (await page.getByTestId('chart-pane').first().locator('.u-over').boundingBox())!;
  await page.mouse.move(box.x + box.width * fx, box.y + box.height / 2);
}

test('markers: M drops one, it is listed, survives a reload, and stays with its log', async ({
  page,
}) => {
  await loadDemo(page);
  await hoverPlot(page, 0.4);
  await page.keyboard.press('m');
  await expect(page.getByTestId('chart-pane').first()).toHaveAttribute('data-markers', '1');

  await page.getByRole('button', { name: 'Inspector' }).click();
  await page.getByRole('tab', { name: 'Markers' }).click();
  await expect(page.getByTestId('marker-row')).toHaveText(/Marker 1/);

  await page.reload();
  await page.getByRole('button', { name: 'Demo engine run' }).click();
  await expect(page.getByTestId('marker-row')).toHaveText(/Marker 1/);

  await page
    .getByLabel('Open log', { exact: true })
    .setInputFiles('tests/fixtures/autodata-sheet2.csv');
  await expect(page.getByRole('banner')).toContainText('autodata-sheet2.csv');
  await expect(page.getByTestId('marker-row')).toHaveCount(0);
});

test('calculated channels: create, plot, save to a layout file and open it again', async ({
  page,
}) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'New calculated channel' }).click();
  const dialog = page.getByRole('dialog', { name: 'New calculated channel' });
  await dialog.getByLabel('Name').fill('Lambda');
  await dialog.getByLabel('Expression').fill('[AFR] / 14.7');
  await expect(dialog.getByText(/min .* max .* values/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();

  const row = page.getByTestId('channel-row').filter({ hasText: 'Lambda' });
  await expect(row).toContainText('fx');
  await row.click();
  const lambda = page
    .getByTestId('chart-pane')
    .nth(0)
    .getByRole('button', { name: /Lambda/ });
  await expect(lambda).toBeVisible();

  await hoverPlot(page, 0.5);
  const afr = Number(
    await page.getByTestId('chart-pane').nth(1).getByTestId('legend-value').first().textContent(),
  );
  const lambdaValue = Number(await lambda.getByTestId('legend-value').textContent());
  expect(lambdaValue).toBeCloseTo(afr / 14.7, 2);

  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save layout to file…' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('datalogviewer-layout.dlvlayout.json');
  const path = await download.path();

  await page.getByRole('button', { name: 'Options for Lambda' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByTestId('channel-row').filter({ hasText: 'Lambda' })).toHaveCount(0);

  await page.getByLabel('Open layout file').setInputFiles(path!);
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByTestId('channel-row').filter({ hasText: 'Lambda' })).toBeVisible();
});

test('range statistics: Shift+drag shows the Range tab with values', async ({ page }) => {
  await loadDemo(page);
  const box = (await page.getByTestId('chart-pane').first().locator('.u-over').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect(page.getByRole('tab', { name: 'Range', selected: true })).toBeVisible();
  const rpm = page.getByTestId('range-row').filter({ hasText: 'Engine Speed' });
  await expect(rpm).toContainText(/\d,\d{3}/);
  await expect(page.getByText(/samples/)).toBeVisible();
});

test('scatter view: loads Plotly on demand and plots the first two channels', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('radio', { name: 'Scatter' }).click();
  const plot = page.locator('.js-plotly-plot');
  await expect(plot.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  await expect(plot.locator('.xtitle')).toHaveText('Engine Speed (rpm)');
  await expect(plot.locator('.ytitle')).toHaveText('MAP (kPa)');

  await page.getByLabel('Colour by').selectOption({ index: 3 });
  await expect(plot.locator('.colorbar')).toHaveCount(1);
});

test('Export CSV downloads the visible range of the plotted channels', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'More' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('demo-run-0-479.95s.csv');
  const text = readFileSync((await file.path())!, 'utf8');
  expect(text.split('\n')[0]).toMatch(/^Time \(s\),Engine Speed \(rpm\),MAP \(kPa\)/);
});
