import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { Legend } from '@/charts/Legend';
import { parseCsvText } from '@/io/csv/parseCsv';
import { bindLayout, EMPTY_LAYOUT, type PaneLayout } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';

const log = parseCsvText('Time (s),RPM (rpm)\n0,800\n0.05,810', {
  fileName: 't.csv',
  encoding: 'utf-8',
});
const paneLayout: PaneLayout = {
  id: 'p1',
  size: 100,
  sharedAxis: false,
  series: [
    { header: 'RPM', color: 's1' },
    { header: 'Boost (psi)', color: 's2' },
  ],
};

beforeEach(() => {
  useLayoutStore.setState({ ...EMPTY_LAYOUT, panes: [paneLayout] });
  useViewStore.getState().resetForLog(log.time);
});

const renderLegend = (props: Partial<Parameters<typeof Legend>[0]> = {}) => {
  const pane = bindLayout(useLayoutStore.getState(), log)[0];
  return render(
    <Legend pane={pane} log={log} onHoverSeries={vi.fn()} onUseForAxis={vi.fn()} {...props} />,
  );
};
const entry = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

test('shows name, unit and the value at the cursor', () => {
  renderLegend();
  expect(entry('RPM')).toHaveTextContent('rpm');
  expect(within(entry('RPM')).getByTestId('legend-value')).toHaveTextContent('—');
});

test('values follow the cursor', () => {
  useViewStore.setState({ cursor: 1 });
  renderLegend();
  expect(within(entry('RPM')).getByTestId('legend-value')).toHaveTextContent('810');
});

test('a series missing from this log is struck through and labelled', () => {
  renderLegend();
  const boost = entry('Boost');
  expect(boost).toHaveTextContent('not in this log');
  expect(boost.querySelector('.line-through')).not.toBeNull();
});

test('hovering an entry reports it for the y-axis', async () => {
  const onHoverSeries = vi.fn();
  renderLegend({ onHoverSeries });
  await userEvent.hover(entry('RPM'));
  expect(onHoverSeries).toHaveBeenCalledWith('RPM');
  await userEvent.unhover(entry('RPM'));
  expect(onHoverSeries).toHaveBeenLastCalledWith(null);
});

test('the entry menu removes the series', async () => {
  renderLegend();
  await userEvent.click(entry('RPM'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
  expect(useLayoutStore.getState().panes[0].series.map((s) => s.header)).toEqual(['Boost (psi)']);
});

test('the entry menu changes the colour', async () => {
  renderLegend();
  await userEvent.click(entry('RPM'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Colour 3' }));
  expect(useLayoutStore.getState().panes[0].series[0].color).toBe('s3');
});

test('the entry menu can pin the y-axis to a series', async () => {
  const onUseForAxis = vi.fn();
  renderLegend({ onUseForAxis });
  await userEvent.click(entry('RPM'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Use for y-axis' }));
  expect(onUseForAxis).toHaveBeenCalledWith('RPM');
});

test('a manual scale can be set and cleared', async () => {
  renderLegend();
  await userEvent.click(entry('RPM'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Set scale…' }));
  await userEvent.type(await screen.findByLabelText('Minimum'), '0');
  await userEvent.type(screen.getByLabelText('Maximum'), '7000');
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(useLayoutStore.getState().panes[0].series[0].scale).toEqual({ min: 0, max: 7000 });

  await userEvent.click(entry('RPM'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Auto scale' }));
  expect(useLayoutStore.getState().panes[0].series[0].scale).toBeUndefined();
});

test('a cursor beyond the end of the log shows no value', () => {
  useViewStore.setState({ cursor: 6700 });
  renderLegend();
  expect(within(entry('RPM')).getByTestId('legend-value')).toHaveTextContent('—');
});
