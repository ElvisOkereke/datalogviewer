import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { withCalculated } from '@/data/calculated';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { CalculatedEditor } from '@/ui/CalculatedEditor';

const raw = parseCsvText('Time (s),RPM,AFR\n0,800,14.7\n0.05,900,13.0\n0.1,1000,11.76', {
  fileName: 't.csv',
  encoding: 'utf-8',
});
const calculated = () => useLayoutStore.getState().calculated;

beforeEach(() => useLayoutStore.setState({ ...EMPTY_LAYOUT }));

function open(props: Partial<Parameters<typeof CalculatedEditor>[0]> = {}) {
  const log = withCalculated(raw, calculated()).log;
  const onOpenChange = vi.fn();
  render(<CalculatedEditor open log={log} onOpenChange={onOpenChange} {...props} />);
  return { onOpenChange };
}
const setExpression = (value: string) =>
  fireEvent.change(screen.getByLabelText('Expression'), { target: { value } });
const save = () => screen.getByRole('button', { name: 'Save' });

test('creates a channel once the expression checks out, showing a preview', async () => {
  const { onOpenChange } = open();
  await userEvent.type(screen.getByLabelText('Name'), 'Lambda');
  await userEvent.type(screen.getByLabelText('Unit'), 'λ');
  setExpression('[AFR] / 14.7');
  expect(await screen.findByText(/min 0\.8.*max 1.*3 values/)).toBeInTheDocument();
  await userEvent.click(save());
  expect(calculated()).toEqual([
    { id: expect.any(String), name: 'Lambda', unit: 'λ', expression: '[AFR] / 14.7' },
  ]);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test('an invalid expression shows where the problem is and blocks saving', async () => {
  open();
  await userEvent.type(screen.getByLabelText('Name'), 'Bad');
  setExpression('[AFR] /');
  expect(await screen.findByText(/at character 8/)).toBeInTheDocument();
  expect(save()).toBeDisabled();
});

test('an unknown channel is reported', async () => {
  open();
  await userEvent.type(screen.getByLabelText('Name'), 'X');
  setExpression('[Boost] * 2');
  expect(await screen.findByText(/Unknown channel \[Boost\]/)).toBeInTheDocument();
  expect(save()).toBeDisabled();
});

test('a name already used by a channel is rejected', async () => {
  open();
  await userEvent.type(screen.getByLabelText('Name'), 'rpm');
  setExpression('1');
  expect(await screen.findByText('Name already used')).toBeInTheDocument();
  expect(save()).toBeDisabled();
});

test('editing an existing definition prefills it and saves changes', async () => {
  const id = useLayoutStore.getState().addCalculated({ name: 'Half', expression: 'RPM / 2' });
  open({ editing: calculated()[0] });
  expect(screen.getByLabelText('Name')).toHaveValue('Half');
  setExpression('RPM / 4');
  expect(await screen.findByText(/min 200/)).toBeInTheDocument();
  await userEvent.click(save());
  expect(calculated()).toEqual([{ id, name: 'Half', expression: 'RPM / 4' }]);
});

test('Insert channel adds a bracketed reference', async () => {
  open();
  setExpression('2 * ');
  await userEvent.selectOptions(screen.getByLabelText('Insert channel'), 'AFR');
  expect(screen.getByLabelText('Expression')).toHaveValue('2 * [AFR]');
});

test('a calculated channel picked by its header validates and keeps working after saving', async () => {
  useLayoutStore
    .getState()
    .addCalculated({ name: 'Lambda', unit: 'λ', expression: '[AFR] / 14.7' });
  open();
  await userEvent.type(screen.getByLabelText('Name'), 'Pct');
  await userEvent.selectOptions(screen.getByLabelText('Insert channel'), 'Lambda (λ)');
  expect(await screen.findByText(/3 values/)).toBeInTheDocument();
  await userEvent.click(save());
  expect(withCalculated(raw, calculated()).errors).toEqual({});
});

test('a cycle through another calculated channel is caught before saving', async () => {
  const store = useLayoutStore.getState();
  store.addCalculated({ name: 'A', expression: '[RPM] * 2' });
  store.addCalculated({ name: 'B', expression: '[A] + 1' });
  open({ editing: calculated()[0] });
  setExpression('[B] * 2');
  expect(await screen.findByText(/refers to itself/)).toBeInTheDocument();
  expect(save()).toBeDisabled();
});

test('Save waits for the check of what is typed now', async () => {
  open();
  await userEvent.type(screen.getByLabelText('Name'), 'X');
  setExpression('[AFR] * 2');
  expect(await screen.findByText(/3 values/)).toBeInTheDocument();
  setExpression('[AFR] *');
  expect(save()).toBeDisabled();
});
