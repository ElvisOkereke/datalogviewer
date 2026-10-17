import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useLogStore } from '@/state/logStore';
import { AppShell } from '@/ui/AppShell';

// jsdom has no canvas; chart rendering is covered by Playwright.
vi.mock('@/charts/ChartPane', () => ({ ChartPane: () => <div data-testid="chart-pane" /> }));
vi.mock('@/charts/OverviewStrip', () => ({ OverviewStrip: () => null }));

const log = parseCsvText('Time (s),RPM (rpm),AFR\n0,800,14.7\n0.05,810,14.6', {
  fileName: 'run.csv',
  encoding: 'utf-8',
});
const renderShell = () =>
  render(
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>,
  );
const loadLog = () =>
  act(() => useLogStore.setState({ logs: { [log.id]: log }, activeLogId: log.id }));

beforeEach(() => {
  useLogStore.setState({ logs: {}, activeLogId: null, status: { kind: 'idle' } });
  useLayoutStore.setState({ ...EMPTY_LAYOUT });
});

test('without a log: open button, sample buttons and the privacy note', () => {
  renderShell();
  expect(screen.getAllByRole('button', { name: 'Open log' }).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Demo engine run' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Real-world export' })).toBeInTheDocument();
  expect(screen.getByText(/never leave your browser/)).toBeInTheDocument();
});

test('with a log: toolbar file info, sidebar and default panes', () => {
  renderShell();
  loadLog();
  expect(screen.getByRole('banner')).toHaveTextContent('run.csv');
  expect(screen.getByRole('banner')).toHaveTextContent('2 rows');
  expect(screen.getByPlaceholderText('Search 3 channels…')).toBeInTheDocument();
  // Two plottable channels → one default pane (the second pane takes the third channel).
  expect(screen.getAllByTestId('chart-pane')).toHaveLength(1);
});

test('the Table toggle swaps the charts for the table', async () => {
  renderShell();
  loadLog();
  await userEvent.click(screen.getByRole('radio', { name: 'Table' }));
  expect(screen.getByRole('grid')).toBeInTheDocument();
  expect(screen.queryAllByTestId('chart-pane')).toHaveLength(0);
  expect(useLayoutStore.getState().view).toBe('table');
});

test('the Inspector toggle shows the Inspector', async () => {
  renderShell();
  loadLog();
  await userEvent.click(screen.getByRole('button', { name: 'Inspector' }));
  expect(screen.getByText('Hover a chart')).toBeInTheDocument();
});

test('a load error shows an alert with a private report link', () => {
  useLogStore.setState({
    status: { kind: 'error', fileName: 'bad.csv', code: 'empty', message: '"bad.csv" is empty.' },
  });
  renderShell();
  expect(screen.getByRole('alert')).toHaveTextContent('"bad.csv" is empty.');
  const href = screen.getByRole('link', { name: 'Report this file' }).getAttribute('href')!;
  expect(decodeURIComponent(href)).not.toContain('bad.csv');
});

test('? opens the keyboard shortcuts dialog', async () => {
  renderShell();
  loadLog();
  await userEvent.keyboard('?');
  expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
});

test('a very large file asks before loading', async () => {
  const loadFile = vi.fn();
  useLogStore.setState({ loadFile });
  renderShell();
  const big = new File(['x'], 'huge.csv');
  Object.defineProperty(big, 'size', { value: 200 * 1024 * 1024 });
  fireEvent.change(screen.getByLabelText('Open log'), { target: { files: [big] } });
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('huge.csv');
  expect(loadFile).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Load anyway' }));
  expect(loadFile).toHaveBeenCalledWith(big);
});

describe('calculated channels', () => {
  test('a definition in the layout shows as an fx channel in the sidebar', () => {
    useLayoutStore.setState({
      ...EMPTY_LAYOUT,
      calculated: [{ id: 'k', name: 'Double RPM', expression: '[RPM] * 2' }],
    });
    renderShell();
    loadLog();
    const row = screen
      .getAllByTestId('channel-row')
      .find((r) => r.textContent?.includes('Double RPM'))!;
    expect(row).toHaveTextContent('fx');
    expect(row).toHaveAttribute('aria-disabled', 'false');
  });

  test('a definition this log cannot satisfy is listed with the reason, and the app still renders', () => {
    useLayoutStore.setState({
      ...EMPTY_LAYOUT,
      calculated: [{ id: 'k', name: 'Ratio', expression: '[Lambda] * 2' }],
    });
    renderShell();
    loadLog();
    expect(screen.getByTestId('calc-unavailable')).toHaveTextContent('Ratio');
    expect(screen.getByTestId('calc-unavailable')).toHaveTextContent('needs [Lambda]');
    expect(screen.getAllByTestId('chart-pane').length).toBeGreaterThan(0);
  });
});
