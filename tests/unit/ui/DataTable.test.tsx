import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { useViewStore } from '@/state/viewStore';
import { DataTable } from '@/ui/DataTable';

const log = parseCsvText(
  'Time (s),RPM (rpm),Mode\n0,800,Idle\n0.05,810,Closed Loop\n0.1,820,Idle',
  {
    fileName: 't.csv',
    encoding: 'utf-8',
  },
);
const dataRow = (index: number) =>
  screen.getAllByRole('row').find((r) => r.getAttribute('data-index') === String(index))!;

beforeEach(() => {
  // jsdom has no layout; give the scroll box a real size so the virtualizer renders rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  useViewStore.getState().resetForLog(log.time);
});
afterEach(() => vi.restoreAllMocks());

test('header shows channel names with units', () => {
  render(<DataTable log={log} />);
  const header = screen.getAllByRole('columnheader');
  expect(header.map((h) => h.textContent)).toEqual(['Time', 'RPMrpm', 'Mode']);
});

test('rows show time and values', () => {
  render(<DataTable log={log} />);
  expect(dataRow(1)).toHaveTextContent('0.05 s');
  expect(dataRow(1)).toHaveTextContent('810');
  expect(dataRow(1)).toHaveTextContent('Closed Loop');
});

test('clicking a row pins the cursor there', async () => {
  render(<DataTable log={log} />);
  await userEvent.click(dataRow(1));
  expect(useViewStore.getState()).toMatchObject({ cursor: 1, pinned: true });
});

test('the cursor row is selected', () => {
  useViewStore.setState({ cursor: 2 });
  render(<DataTable log={log} />);
  expect(dataRow(2)).toHaveAttribute('aria-selected', 'true');
  expect(dataRow(1)).toHaveAttribute('aria-selected', 'false');
});
