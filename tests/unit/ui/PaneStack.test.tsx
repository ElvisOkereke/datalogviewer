import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { PaneStack } from '@/ui/PaneStack';

// jsdom has no canvas; chart rendering is covered by Playwright.
vi.mock('@/charts/ChartPane', () => ({
  ChartPane: ({ pane, focused }: { pane: { id: string }; focused: boolean }) => (
    <div data-testid="chart-pane" data-pane-id={pane.id} data-focused={String(focused)} />
  ),
}));

const log = parseCsvText('Time (s),RPM,AFR\n0,800,14.7\n0.05,810,14.6', {
  fileName: 't.csv',
  encoding: 'utf-8',
});
const panes = () => useLayoutStore.getState().panes;
const paneEl = (id: string) =>
  screen.getAllByTestId('pane').find((el) => el.dataset.paneId === id)!;
/**
 * Opens a pane menu from the keyboard: in jsdom every element is 0×0, so the panel group treats
 * pointer presses as separator drags. Real mouse clicks are covered by Playwright.
 */
async function openMenu(trigger: HTMLElement) {
  trigger.focus();
  await userEvent.keyboard('{Enter}');
}
const drop = (el: Element, header: string) =>
  fireEvent.drop(el, {
    dataTransfer: { getData: () => header, types: ['application/x-dlv-channel'] },
  });

beforeEach(() => {
  useLayoutStore.setState({
    ...EMPTY_LAYOUT,
    panes: [
      { id: 'p1', size: 50, sharedAxis: false, series: [{ header: 'RPM', color: 's1' }] },
      { id: 'p2', size: 50, sharedAxis: false, series: [] },
    ],
  });
  useViewStore.setState({ focusedPaneId: 'p2' });
});

test('renders one chart per pane plus an Add chart zone', () => {
  render(<PaneStack log={log} />);
  expect(screen.getAllByTestId('chart-pane').map((el) => el.dataset.paneId)).toEqual(['p1', 'p2']);
  expect(screen.getByRole('button', { name: 'Add chart' })).toBeInTheDocument();
});

test('deleting the focused pane moves focus to the previous one', async () => {
  render(<PaneStack log={log} />);
  await openMenu(within(paneEl('p2')).getByRole('button', { name: 'Chart options' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete chart' }));
  expect(panes().map((p) => p.id)).toEqual(['p1']);
  expect(useViewStore.getState().focusedPaneId).toBe('p1');
});

test('deleting the last pane leaves only Add chart', async () => {
  useLayoutStore.setState({ ...EMPTY_LAYOUT, panes: [panes()[0]] });
  useViewStore.setState({ focusedPaneId: 'p1' });
  render(<PaneStack log={log} />);
  await userEvent.click(screen.getByRole('button', { name: 'Chart options' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete chart' }));
  expect(screen.queryAllByTestId('chart-pane')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Add chart' })).toBeInTheDocument();
  expect(useViewStore.getState().focusedPaneId).toBeNull();
});

test('dropping a channel on a pane plots it there', () => {
  render(<PaneStack log={log} />);
  drop(paneEl('p2'), 'AFR');
  expect(panes()[1].series.map((s) => s.header)).toEqual(['AFR']);
});

test('dropping a channel on Add chart creates a pane with it', () => {
  render(<PaneStack log={log} />);
  drop(screen.getByRole('button', { name: 'Add chart' }), 'AFR');
  expect(panes()).toHaveLength(3);
  expect(panes()[2].series.map((s) => s.header)).toEqual(['AFR']);
});

test('clicking Add chart adds an empty pane and focuses it', async () => {
  render(<PaneStack log={log} />);
  await userEvent.click(screen.getByRole('button', { name: 'Add chart' }));
  expect(panes()).toHaveLength(3);
  expect(useViewStore.getState().focusedPaneId).toBe(panes()[2].id);
});

test('the pane menu toggles the shared axis and clears series', async () => {
  render(<PaneStack log={log} />);
  const options = within(paneEl('p1')).getByRole('button', { name: 'Chart options' });
  await openMenu(options);
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Shared axis' }));
  expect(panes()[0].sharedAxis).toBe(true);
  await openMenu(options);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Clear' }));
  expect(panes()[0].series).toEqual([]);
});

test('with nothing selected yet, the first chart shows as selected', () => {
  useViewStore.setState({ focusedPaneId: null });
  render(<PaneStack log={log} />);
  const focused = screen.getAllByTestId('chart-pane').map((el) => el.dataset.focused);
  expect(focused).toEqual(['true', 'false']);
});
