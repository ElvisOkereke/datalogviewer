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

async function xRange(page: Page, pane = 0) {
  const el = page.getByTestId('chart-pane').nth(pane);
  return {
    min: Number(await el.getAttribute('data-x-min')),
    max: Number(await el.getAttribute('data-x-max')),
  };
}

test('wheel zooms around the pointer, double-click fits, both panes stay in step', async ({
  page,
}) => {
  await loadDemo(page);
  const full = await xRange(page);
  expect(full.min).toBe(0);
  expect(full.max).toBeGreaterThan(470);

  await hoverPlot(page, 0.5);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await expect
    .poll(async () => (await xRange(page)).max - (await xRange(page)).min)
    .toBeLessThan((full.max - full.min) * 0.6);
  expect(await xRange(page, 1)).toEqual(await xRange(page, 0));

  await page.getByTestId('chart-pane').first().locator('.u-over').dblclick();
  await expect.poll(() => xRange(page)).toEqual(full);
});

test('dragging pans a zoomed view; Shift+drag zooms to the selection', async ({ page }) => {
  await loadDemo(page);
  await hoverPlot(page, 0.5);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await xRange(page)).min).toBeGreaterThan(0);
  const zoomed = await xRange(page);

  const box = (await page.getByTestId('chart-pane').first().locator('.u-over').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.6, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, y, { steps: 5 });
  await page.mouse.up();
  const panned = await xRange(page);
  expect(panned.min).toBeGreaterThan(zoomed.min);
  expect(panned.max - panned.min).toBeCloseTo(zoomed.max - zoomed.min, 5);

  await page.getByTestId('chart-pane').first().locator('.u-over').dblclick();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const selected = await xRange(page);
  expect(selected.min).toBeGreaterThan(100);
  expect(selected.max).toBeLessThan(260);
});

test('click pins the cursor; arrow keys step it; Escape releases it', async ({ page }) => {
  await loadDemo(page);
  const over = page.getByTestId('chart-pane').first().locator('.u-over');
  const box = (await over.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
  const pinned = await legendValues(page);
  expect(pinned.every((v) => v !== '—')).toBe(true);

  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  expect(await legendValues(page)).toEqual(pinned);

  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  await page.mouse.move(5, 5);
  const stepped = await legendValues(page);
  expect(stepped).not.toEqual(pinned);
  expect(stepped.every((v) => v !== '—')).toBe(true);

  await page.keyboard.press('Escape');
  await hoverPlot(page, 0.5);
  await page.mouse.move(5, 5);
  await expect.poll(() => legendValues(page)).toEqual(['—', '—', '—']);
});

test('overview strip shows and moves the visible window', async ({ page }) => {
  await loadDemo(page);
  const strip = page.getByTestId('overview').locator('.u-over');
  const win = page.getByTestId('overview-window');
  const stripBox = (await strip.boundingBox())!;
  const fullBox = (await win.boundingBox())!;
  expect(Math.abs(fullBox.width - stripBox.width)).toBeLessThanOrEqual(2);

  await hoverPlot(page, 0.5);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await win.boundingBox())!.width).toBeLessThan(fullBox.width * 0.6);

  const before = await xRange(page);
  const box = (await win.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, y, { steps: 5 });
  await page.mouse.up();
  const after = await xRange(page);
  expect(after.min).toBeGreaterThan(before.min);
  expect(after.max - after.min).toBeCloseTo(before.max - before.min, 5);

  const moved = (await win.boundingBox())!;
  await page.mouse.move(moved.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(moved.x + 52, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await win.boundingBox())!.width).toBeLessThan(moved.width - 30);
});

test('the pane menu opens with a mouse click and can delete a chart', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('pane').nth(1).getByRole('button', { name: 'Chart options' }).click();
  await page.getByRole('menuitem', { name: 'Delete chart' }).click();
  await expect(page.getByTestId('chart-pane')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add chart' }).click();
  await expect(page.getByTestId('chart-pane')).toHaveCount(2);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('panels become drawers; channels can be plotted; a tap pins the cursor', async ({
    page,
  }) => {
    await loadDemo(page);
    await expect(page.getByPlaceholder('Search 10 channels…')).toBeHidden();

    await page.getByRole('button', { name: 'Channels' }).tap();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByPlaceholder('Search 10 channels…')).toBeVisible();
    await drawer.getByTestId('channel-row').filter({ hasText: 'Battery Voltage' }).tap();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: /Battery Voltage/ })).toBeVisible();

    const over = page.getByTestId('chart-pane').first().locator('.u-over');
    const box = (await over.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height / 2);
    await expect.poll(async () => (await legendValues(page)).every((v) => v !== '—')).toBe(true);

    await page.getByRole('button', { name: 'Inspector' }).tap();
    await expect(page.getByRole('dialog').getByText(/At cursor/)).toBeVisible();
  });
});

test.describe('toolbar on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('every toolbar control fits on screen', async ({ page }) => {
    await loadDemo(page);
    for (const name of ['Channels', 'Inspector', 'Open log', 'More']) {
      const box = (await page.getByRole('banner').getByRole('button', { name }).boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
  });
});
