import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { CalculatedEditor } from '@/ui/CalculatedEditor';

test('Insert channel uses the plain name for a header with a [unit]', async () => {
  const log = parseCsvText('Time (s),MAP [kPa]\n0,30\n1,40', {
    fileName: 't.csv',
    encoding: 'utf-8',
  });
  render(<CalculatedEditor open log={log} onOpenChange={() => {}} />);
  await userEvent.selectOptions(screen.getByLabelText('Insert channel'), 'MAP [kPa]');
  expect(screen.getByLabelText('Expression')).toHaveValue('[MAP]');
});
