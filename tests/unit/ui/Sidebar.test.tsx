import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { Sidebar } from '@/ui/Sidebar';

const log = parseCsvText('Time (s),RPM,MAP (kPa),Mode\n0,800,30,Idle\n0.05,810,31,Idle', {
  fileName: 't.csv',
  encoding: 'utf-8',
});
const rows = () => screen.getAllByTestId('channel-row');
const row = (name: string) => rows().find((r) => r.textContent?.includes(name))!;
const seriesIn = (paneId: string) =>
  useLayoutStore
    .getState()
    .panes.find((p) => p.id === paneId)!
    .series.map((s) => s.header);

beforeEach(() => {
  useLayoutStore.setState({
    ...EMPTY_LAYOUT,
    panes: [
      { id: 'p1', size: 50, sharedAxis: false, series: [] },
      { id: 'p2', size: 50, sharedAxis: false, series: [] },
    ],
  });
  useViewStore.setState({ focusedPaneId: 'p2' });
});

test('lists every channel with its unit and marks the time channel', () => {
  render(<Sidebar log={log} />);
  expect(rows()).toHaveLength(4);
  expect(screen.getByPlaceholderText('Search 4 channels…')).toBeInTheDocument();
  expect(row('MAP')).toHaveTextContent('kPa');
  expect(row('Time')).toHaveTextContent('time');
});

test('search filters the list', async () => {
  render(<Sidebar log={log} />);
  await userEvent.type(screen.getByPlaceholderText('Search 4 channels…'), 'map');
  expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('MAP')]);
});

test('clicking a channel adds it to the focused pane', async () => {
  render(<Sidebar log={log} />);
  await userEvent.click(row('RPM'));
  expect(seriesIn('p2')).toEqual(['RPM']);
  expect(seriesIn('p1')).toEqual([]);
});

test('without a focused pane, the first pane gets it', async () => {
  useViewStore.setState({ focusedPaneId: null });
  render(<Sidebar log={log} />);
  await userEvent.click(row('RPM'));
  expect(seriesIn('p1')).toEqual(['RPM']);
});

test('with no panes, clicking creates one', async () => {
  useLayoutStore.setState({ ...EMPTY_LAYOUT });
  useViewStore.setState({ focusedPaneId: null });
  render(<Sidebar log={log} />);
  await userEvent.click(row('RPM'));
  const panes = useLayoutStore.getState().panes;
  expect(panes).toHaveLength(1);
  expect(panes[0].series.map((s) => s.header)).toEqual(['RPM']);
});

test('text channels cannot be plotted', async () => {
  render(<Sidebar log={log} />);
  expect(row('Mode')).toHaveAttribute('aria-disabled', 'true');
  expect(row('Mode')).toHaveAttribute('draggable', 'false');
  await userEvent.click(row('Mode'));
  expect(seriesIn('p2')).toEqual([]);
});

test('dragging a channel carries its header', () => {
  render(<Sidebar log={log} />);
  const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
  fireEvent.dragStart(row('RPM'), { dataTransfer });
  expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-dlv-channel', 'RPM');
});

test('long channel lists are virtualized', () => {
  // jsdom has no layout; give the scroll box a real height so the virtualizer renders rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(220);
  const header = Array.from({ length: 300 }, (_, i) => `Ch${i}`).join(',');
  const wide = parseCsvText(`${header}\n${Array(300).fill('1').join(',')}`, {
    fileName: 'w.csv',
    encoding: 'utf-8',
  });
  render(<Sidebar log={wide} />);
  expect(rows().length).toBeGreaterThan(5);
  expect(rows().length).toBeLessThan(60);
  vi.restoreAllMocks();
});
