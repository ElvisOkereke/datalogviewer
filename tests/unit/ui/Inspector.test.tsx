import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { Inspector } from '@/ui/Inspector';

const log = parseCsvText('Time (s),RPM (rpm),Mode\n0,800,Idle\n0.05,810,Closed Loop', {
  fileName: 't.csv',
  encoding: 'utf-8',
});
const row = (name: string) =>
  screen.getAllByTestId('inspector-row').find((r) => r.textContent?.startsWith(name))!;

beforeEach(() => useViewStore.getState().resetForLog(log.time));

test('asks for a hover when there is no cursor', () => {
  render(<Inspector log={log} />);
  expect(screen.getByText('Hover a chart')).toBeInTheDocument();
  expect(row('RPM')).toHaveTextContent('—');
});

test('shows every channel at the cursor, text channels included', () => {
  useViewStore.setState({ cursor: 1 });
  render(<Inspector log={log} />);
  expect(screen.getByText(/At cursor · 0\.05 s/)).toBeInTheDocument();
  expect(row('RPM')).toHaveTextContent('810');
  expect(row('RPM')).toHaveTextContent('rpm');
  expect(row('Mode')).toHaveTextContent('Closed Loop');
});

test('search filters channels', async () => {
  render(<Inspector log={log} />);
  await userEvent.type(screen.getByLabelText('Search Inspector'), 'rp');
  expect(screen.getAllByTestId('inspector-row')).toHaveLength(1);
});

test('a cursor beyond the end of the log is treated as no cursor', () => {
  useViewStore.setState({ cursor: 6700, pinned: true });
  render(<Inspector log={log} />);
  expect(screen.getByText('Hover a chart')).toBeInTheDocument();
});

describe('tabs', () => {
  beforeEach(() => useLayoutStore.setState({ ...EMPTY_LAYOUT }));

  test('the Range tab explains how to select when nothing is selected', async () => {
    render(<Inspector log={log} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Range' }));
    expect(screen.getByText(/Shift\+drag/)).toBeInTheDocument();
    expect(useLayoutStore.getState().inspectorTab).toBe('range');
  });

  test('the Range tab shows statistics for the selection', () => {
    useLayoutStore.setState({ inspectorTab: 'range' });
    useViewStore.setState({ selection: { min: 0, max: 0.05 } });
    render(<Inspector log={log} />);
    const rpm = screen.getAllByTestId('range-row').find((r) => r.textContent?.startsWith('RPM'))!;
    expect(rpm).toHaveTextContent('805'); // mean of 800 and 810
    expect(screen.getByText(/2 samples/)).toBeInTheDocument();
  });

  test('Zoom to selection and Clear', async () => {
    useLayoutStore.setState({ inspectorTab: 'range' });
    useViewStore.setState({ selection: { min: 0, max: 0.05 } });
    render(<Inspector log={log} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(useViewStore.getState().selection).toBeNull();
  });
});

describe('markers tab', () => {
  beforeEach(async () => {
    const { useMarkerStore } = await import('@/state/markers');
    useMarkerStore.setState({ key: null, markers: [] });
    useLayoutStore.setState({ ...EMPTY_LAYOUT, inspectorTab: 'markers' });
  });

  test('add, rename and jump to a marker', async () => {
    render(<Inspector log={log} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add marker' }));
    const row = await screen.findByTestId('marker-row');
    expect(row).toHaveTextContent('Marker 1');

    await userEvent.click(screen.getByRole('button', { name: 'Rename Marker 1' }));
    const input = screen.getByRole('textbox', { name: 'Marker name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Shift{Enter}');
    expect(screen.getByTestId('marker-row')).toHaveTextContent('Shift');

    await userEvent.click(screen.getByRole('button', { name: 'Shift' }));
    expect(useViewStore.getState().pinned).toBe(true);
    expect(useViewStore.getState().cursor).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Shift' }));
    expect(screen.queryByTestId('marker-row')).toBeNull();
  });
});
