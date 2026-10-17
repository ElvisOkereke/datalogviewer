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

test('the layout survives a reload and re-binds across logs', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('channel-row').filter({ hasText: 'Battery Voltage' }).click();
  await expect(
    page.getByTestId('chart-pane').getByRole('button', { name: /Battery Voltage/ }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Demo engine run' }).click();
  await expect(
    page.getByTestId('chart-pane').getByRole('button', { name: /Battery Voltage/ }),
  ).toBeVisible();

  await page.getByLabel('Open log').setInputFiles('tests/fixtures/autodata-sheet2.csv');
  await expect(page.getByRole('banner')).toContainText('autodata-sheet2.csv');
  await expect(
    page.getByTestId('chart-pane').getByRole('button', { name: /Engine Speed.*not in this log/ }),
  ).toBeVisible();
  await page.getByTestId('channel-row').filter({ hasText: 'Engine Load' }).click();
  await expect(
    page
      .getByTestId('chart-pane')
      .getByRole('button', { name: /Engine Load/ })
      .first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Layout' }).click();
  await page.getByRole('menuitem', { name: 'Reset layout' }).click();
  await expect(page.getByText('not in this log')).toHaveCount(0);
  await expect(
    page.getByTestId('chart-pane').getByRole('button', { name: /Accelerator Position/ }),
  ).toBeVisible();
  await expect(
    page.getByTestId('chart-pane').getByRole('button', { name: /Coolant Temperature/ }),
  ).toBeVisible();
});

test('switching to the light theme redraws the charts', async ({ page }) => {
  await loadDemo(page);
  await hoverPlot(page, 0.5);
  const before = await legendValues(page);
  const themeButton = page.getByRole('banner').getByRole('button', { name: /^Theme:/ });
  while ((await page.locator('html').getAttribute('data-theme')) !== 'light') {
    await themeButton.click();
  }
  await expect(page.getByTestId('chart-pane').first().locator('canvas')).toHaveCount(1);
  await hoverPlot(page, 0.5);
  expect(await legendValues(page)).toEqual(before);
});

test('opening a short log while the cursor is pinned deep in a long one does not crash', async ({
  page,
}) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Inspector' }).click();
  const box = (await page.getByTestId('chart-pane').first().locator('.u-over').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  await expect(page.getByText(/At cursor/)).toBeVisible();

  const rows = Array.from({ length: 30 }, (_, i) => `${(i / 10).toFixed(1)},${800 + i}`).join('\n');
  await page.getByLabel('Open log').setInputFiles({
    name: 'short.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`Time (s),RPM\n${rows}\n`),
  });
  await expect(page.getByRole('banner')).toContainText('short.csv');
  await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
  await expect(page.getByText('Hover a chart')).toBeVisible();
});

test('a pinned crosshair stays on its sample when the view zooms', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Inspector' }).click();
  const pane = page.getByTestId('chart-pane').first();
  const over = pane.locator('.u-over');
  const box = (await over.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
  const header = await page.getByText(/At cursor · /).textContent();
  const pinnedT = Number(header!.match(/([\d.,]+) s/)![1].replace(/,/g, ''));

  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  for (let i = 0; i < 2; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => Number(await pane.getAttribute('data-x-min'))).toBeGreaterThan(0);

  const min = Number(await pane.getAttribute('data-x-min'));
  const max = Number(await pane.getAttribute('data-x-max'));
  const expectedPx = ((pinnedT - min) / (max - min)) * box.width;
  const actualPx = await pane
    .locator('.u-cursor-x')
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  expect(Math.abs(actualPx - expectedPx)).toBeLessThan(3);
});

test('Shift+drag zooms to the selection even with a pinned cursor', async ({ page }) => {
  await loadDemo(page);
  const box = (await page.getByTestId('chart-pane').first().locator('.u-over').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.click(box.x + box.width * 0.4, y);
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const r = await xRange(page);
  expect(r.min).toBeGreaterThan(100);
  expect(r.max).toBeLessThan(260);
  expect(r.max - r.min).toBeGreaterThan(100);
});

test('the channel list follows the selected chart and toggles channels on it', async ({ page }) => {
  await loadDemo(page);
  const channel = (name: string) => page.getByTestId('channel-row').filter({ hasText: name });
  const selectChart = async (n: number) => {
    const pane = page.getByTestId('chart-pane').nth(n);
    const box = (await pane.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + 12); // empty part of the legend row
  };

  // Chart 1 starts selected: Engine Speed and MAP on, AFR shown elsewhere.
  await expect(page.getByText('Chart 1 of 2')).toBeVisible();
  await expect(channel('Engine Speed')).toHaveAttribute('aria-pressed', 'true');
  await expect(channel('AFR')).toHaveAttribute('data-state', 'elsewhere');

  await selectChart(1);
  await expect(page.getByText('Chart 2 of 2')).toBeVisible();
  await expect(channel('AFR')).toHaveAttribute('aria-pressed', 'true');
  await expect(channel('Engine Speed')).toHaveAttribute('aria-pressed', 'false');

  await channel('Battery Voltage').click();
  const secondLegend = page.getByTestId('chart-pane').nth(1);
  await expect(secondLegend.getByRole('button', { name: /Battery Voltage/ })).toBeVisible();
  await channel('Battery Voltage').click();
  await expect(secondLegend.getByRole('button', { name: /Battery Voltage/ })).toHaveCount(0);

  await selectChart(0);
  await expect(channel('Engine Speed')).toHaveAttribute('aria-pressed', 'true');
  await expect(channel('AFR')).toHaveAttribute('aria-pressed', 'false');
});
