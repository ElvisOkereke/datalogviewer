import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { useLogStore } from '@/state/logStore';
import { LoadScreen } from '@/ui/LoadScreen';

// jsdom has no canvas; chart rendering is covered by Playwright.
vi.mock('@/charts/ChartPane', () => ({ ChartPane: () => <div data-testid="chart-pane" /> }));

beforeEach(() => useLogStore.setState({ logs: {}, activeLogId: null, status: { kind: 'idle' } }));
vi.mock('@/charts/OverviewStrip', () => ({ OverviewStrip: () => null }));

test('offers file opening and both samples', () => {
  render(<LoadScreen />);
  expect(screen.getByLabelText('Open log')).toHaveAttribute('type', 'file');
  expect(screen.getByRole('button', { name: 'Demo engine run' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Real-world export' })).toBeInTheDocument();
});

test('summarises the active log', () => {
  const log = parseCsvText('Time (s),RPM,AFR\n0,800,14.7\n0.05,810,14.6', {
    fileName: 'run.csv',
    encoding: 'utf-8',
  });
  useLogStore.setState({ logs: { [log.id]: log }, activeLogId: log.id });
  render(<LoadScreen />);
  expect(screen.getByTestId('row-count')).toHaveTextContent('2');
  expect(screen.getByTestId('time-source')).toHaveTextContent('Time (seconds)');
  expect(screen.getByRole('row', { name: /RPM/ })).toBeInTheDocument();
});

test('shows parse errors with a report link and can dismiss them', () => {
  useLogStore.setState({
    status: { kind: 'error', fileName: 'bad.csv', code: 'empty', message: '"bad.csv" is empty.' },
  });
  render(<LoadScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent('"bad.csv" is empty.');
  expect(screen.getByRole('link', { name: 'Report this file' })).toHaveAttribute(
    'href',
    expect.stringContaining('/issues/new'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('the report link never carries file names or column names', () => {
  useLogStore.setState({
    status: {
      kind: 'error',
      fileName: 'customer-car.csv',
      code: 'no-numeric-columns',
      message: 'No numeric columns found in "customer-car.csv". Columns detected: VIN, Owner.',
    },
  });
  render(<LoadScreen />);
  const href = screen.getByRole('link', { name: 'Report this file' }).getAttribute('href')!;
  const decoded = decodeURIComponent(href);
  expect(decoded).toContain('no-numeric-columns');
  expect(decoded).not.toContain('customer-car');
  expect(decoded).not.toContain('VIN');
});
