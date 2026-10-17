import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { loadPlotly } from '@/charts/plotly';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { ScatterView } from '@/ui/ScatterView';

vi.mock('@/charts/plotly', () => ({ loadPlotly: vi.fn() }));
const load = vi.mocked(loadPlotly);

const log = parseCsvText('Time (s),RPM,MAP (kPa)\n0,800,30\n1,900,40\n2,1000,50', {
  fileName: 't.csv',
  encoding: 'utf-8',
});

beforeEach(() => {
  load.mockReset();
  useLayoutStore.setState({ ...EMPTY_LAYOUT, scatter: { x: 'RPM', y: 'MAP (kPa)' } });
  useViewStore.getState().resetForLog(log.time);
});

test('draws the chosen channels with Plotly once it has loaded', async () => {
  const react = vi.fn(() => Promise.resolve());
  load.mockResolvedValue({ react, purge: vi.fn(), downloadImage: vi.fn() });
  render(<ScatterView log={log} />);
  expect(screen.getByText('Loading scatter view…')).toBeInTheDocument();
  await waitFor(() => expect(react).toHaveBeenCalled());
  const [, data, layout] = react.mock.calls[0] as unknown as [
    unknown,
    { x: Float64Array }[],
    { xaxis: { title: { text: string } }; yaxis: { title: { text: string } } },
  ];
  expect(Array.from(data[0].x)).toEqual([800, 900, 1000]);
  expect(layout.xaxis.title.text).toBe('RPM');
  expect(layout.yaxis.title.text).toBe('MAP (kPa)');
});

test('a failed download offers Retry', async () => {
  load.mockRejectedValueOnce(new Error('offline'));
  render(<ScatterView log={log} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load/i);
  load.mockResolvedValue({
    react: vi.fn(() => Promise.resolve()),
    purge: vi.fn(),
    downloadImage: vi.fn(),
  });
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});

test('a missing channel shows why instead of an empty plot', async () => {
  load.mockResolvedValue({
    react: vi.fn(() => Promise.resolve()),
    purge: vi.fn(),
    downloadImage: vi.fn(),
  });
  useLayoutStore.setState({ scatter: { x: 'Boost', y: 'RPM' } });
  render(<ScatterView log={log} />);
  expect(await screen.findByText("[Boost] isn't in this log")).toBeInTheDocument();
});
