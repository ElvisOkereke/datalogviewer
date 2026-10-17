import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { ScatterControls } from '@/ui/ScatterControls';

const log = parseCsvText('Time (s),RPM,MAP (kPa),AFR\n0,800,30,14.7\n1,900,40,14', {
  fileName: 't.csv',
  encoding: 'utf-8',
});

beforeEach(() => {
  useLayoutStore.setState({ ...EMPTY_LAYOUT, scatter: { x: 'RPM', y: 'MAP (kPa)' } });
  useViewStore.getState().resetForLog(log.time);
});

test('choosing channels updates the saved scatter configuration', async () => {
  render(<ScatterControls log={log} scope="view" onScope={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText('X axis'), 'AFR');
  await userEvent.selectOptions(screen.getByLabelText('Colour by'), 'MAP (kPa)');
  expect(useLayoutStore.getState().scatter).toEqual({
    x: 'AFR',
    y: 'MAP (kPa)',
    color: 'MAP (kPa)',
  });
  await userEvent.selectOptions(screen.getByLabelText('Colour by'), '');
  expect(useLayoutStore.getState().scatter).toEqual({ x: 'AFR', y: 'MAP (kPa)' });
});

test('the Selection scope needs a selection', async () => {
  const onScope = vi.fn();
  render(<ScatterControls log={log} scope="view" onScope={onScope} />);
  expect(screen.getByRole('radio', { name: 'Selection' })).toBeDisabled();
  await userEvent.click(screen.getByRole('radio', { name: 'Whole log' }));
  expect(onScope).toHaveBeenCalledWith('all');
});
