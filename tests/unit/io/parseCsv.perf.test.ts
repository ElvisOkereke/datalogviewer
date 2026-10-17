// @vitest-environment node
import { expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';

// Guards against accidental O(n²) work. 250k × 20 keeps CI fast; 1M rows is checked manually before release.
test('parses 250k rows × 20 columns within budget', () => {
  const header = ['Time (s)', ...Array.from({ length: 19 }, (_, i) => `Ch${i} (u)`)].join(',');
  const lines = [header];
  for (let r = 0; r < 250_000; r++) {
    const cells = [(r / 20).toFixed(2)];
    for (let c = 0; c < 19; c++) cells.push((((r * (c + 1)) % 1000) / 10).toFixed(1));
    lines.push(cells.join(','));
  }
  const text = lines.join('\n');

  const start = performance.now();
  const log = parseCsvText(text, { fileName: 'big.csv', encoding: 'utf-8' });
  const ms = performance.now() - start;

  expect(log.rowCount).toBe(250_000);
  expect(log.channels).toHaveLength(20);
  expect(ms).toBeLessThan(8000);
}, 30_000);
