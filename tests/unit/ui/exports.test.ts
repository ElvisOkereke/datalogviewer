import { beforeEach, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { downloadBlob } from '@/ui/download';
import { exportChannels, exportCsv } from '@/ui/exports';

vi.mock('@/ui/download', () => ({ downloadBlob: vi.fn() }));
const download = vi.mocked(downloadBlob);

const log = parseCsvText('Time (s),RPM,MAP (kPa),AFR\n0,800,30,14\n1,900,40,13\n2,1000,50,12', {
  fileName: 'run.csv',
  encoding: 'utf-8',
});
const pane = (id: string, ...headers: string[]) => ({
  id,
  size: 1,
  sharedAxis: false,
  series: headers.map((header) => ({ header, color: 's1' as const })),
});

beforeEach(() => {
  download.mockReset();
  useLayoutStore.setState({
    ...EMPTY_LAYOUT,
    panes: [pane('a', 'RPM', 'AFR'), pane('b', 'AFR', 'MAP (kPa)', 'Boost')],
  });
  useViewStore.getState().resetForLog(log.time);
});

test('plotted channels once each, in pane order, skipping ones missing from the log', () => {
  expect(exportChannels(log).map((c) => c.header)).toEqual(['RPM', 'AFR', 'MAP (kPa)']);
});

test("the Scatter view exports the scatter's channels", () => {
  useLayoutStore.setState({ view: 'scatter', scatter: { x: 'MAP (kPa)', y: 'RPM', color: 'AFR' } });
  expect(exportChannels(log).map((c) => c.header)).toEqual(['MAP (kPa)', 'RPM', 'AFR']);
});

test('exports the selection when there is one, else the view', async () => {
  expect(exportCsv(log)).toBe(true);
  let [blob, name] = download.mock.calls[0];
  expect(name).toBe('run-0-2s.csv');
  expect((await blob.text()).split('\n')).toHaveLength(5);

  useViewStore.setState({ selection: { min: 0.5, max: 1.5 } });
  exportCsv(log);
  [blob, name] = download.mock.calls[1];
  expect(name).toBe('run-0.5-1.5s.csv');
  expect(await blob.text()).toBe('Time (s),RPM,AFR,MAP (kPa)\n1,900,13,40\n');
});

test('nothing plotted → nothing downloaded', () => {
  useLayoutStore.setState({ panes: [pane('a')] });
  expect(exportCsv(log)).toBe(false);
  expect(download).not.toHaveBeenCalled();
});
