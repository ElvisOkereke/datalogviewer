import { expect, test } from '@playwright/test';

test('app shell loads under the Pages base path', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('DataLogViewer');
  await expect(page.getByRole('banner')).toContainText('DataLogViewer');
});
