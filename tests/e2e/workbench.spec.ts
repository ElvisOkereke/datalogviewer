import { expect, test, type Page } from '@playwright/test';

async function loadDemo(page: Page) {
  await page.goto('./');
  await page.evaluate(() => localStorage.removeItem('dlv.layout.v1'));
  await page.reload();
  await page.getByRole('button', { name: 'Demo engine run' }).click();
  await expect(page.getByTestId('chart-pane')).toHaveCount(2);
}

/** Moves the mouse to a fraction of the first pane's plot area. */
async function hoverPlot(page: Page, fx: number, pane = 0) {
  const over = page.getByTestId('chart-pane').nth(pane).locator('.u-over');
  const box = (await over.boundingBox())!;
  await page.mouse.move(box.x + box.width * fx, box.y + box.height / 2);
}

const legendValues = (page: Page) => page.getByTestId('legend-value').allTextContents();

test('two chart panes render canvases for the demo log', async ({ page }) => {
  await loadDemo(page);
  for (const pane of await page.getByTestId('chart-pane').all()) {
    await expect(pane.locator('canvas')).toHaveCount(1);
  }
});

test('the crosshair is shared across panes and the legend follows it', async ({ page }) => {
  await loadDemo(page);
  expect(new Set(await legendValues(page))).toEqual(new Set(['—']));

  await hoverPlot(page, 0.5);
  const atHalf = await legendValues(page);
  expect(atHalf.length).toBe(3);
  expect(atHalf.every((v) => v !== '—')).toBe(true);

  await hoverPlot(page, 0.75);
  const atThreeQuarters = await legendValues(page);
  expect(atThreeQuarters[0]).not.toBe(atHalf[0]);
});
