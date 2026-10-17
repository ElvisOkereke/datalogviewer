import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
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
