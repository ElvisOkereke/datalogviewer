import { expect, test } from 'vitest';
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { toErrorResponse, transferablesOf } from '@/workers/protocol';

test('transferablesOf lists each numeric buffer once', () => {
  const values = Float64Array.of(1, 2);
  const log = {
    time: Float64Array.of(0, 1),
    channels: [
      { values, text: null },
      { values: null, text: ['a', 'b'] },
      { values, text: null },
    ],
  } as unknown as Log;
  const buffers = transferablesOf(log);
  expect(buffers).toHaveLength(2);
  expect(buffers).toContain(values.buffer);
  expect(buffers).toContain(log.time.buffer);
});

test('toErrorResponse maps error kinds', () => {
  expect(toErrorResponse(new LogParseError('empty', 'nope'))).toEqual({
    type: 'error',
    code: 'empty',
    message: 'nope',
  });
  expect(toErrorResponse(new RangeError('Array buffer allocation failed'))).toMatchObject({
    code: 'out-of-memory',
  });
  expect(toErrorResponse(new Error('boom'))).toEqual({
    type: 'error',
    code: 'internal',
    message: 'boom',
  });
  expect(toErrorResponse('weird')).toMatchObject({ code: 'internal' });
});
