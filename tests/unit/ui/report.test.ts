import { expect, test } from 'vitest';
import { reportUrl } from '@/ui/report';

test('carries the error code and app version only', () => {
  const url = decodeURIComponent(reportUrl('no-numeric-columns'));
  expect(url).toContain('/issues/new');
  expect(url).toContain('no-numeric-columns');
  expect(url).toContain(`App version: ${__APP_VERSION__}`);
});

test('render errors have their own code', () => {
  expect(decodeURIComponent(reportUrl('render-error'))).toContain('render-error');
});
