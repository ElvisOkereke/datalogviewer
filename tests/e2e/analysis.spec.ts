import { expect, test, type Page } from '@playwright/test';

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
