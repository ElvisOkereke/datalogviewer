// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { evaluateFormula, type EvalEnv } from '@/data/formula/evaluate';
import { parseFormula } from '@/data/formula/parse';
import { FormulaError } from '@/data/formula/tokenize';

const columns: Record<string, number[]> = {
  A: [1, 2, NaN, 4],
  B: [10, 0, 5, 2],
  T: [0, 1, 1, 3],
};
const env: EvalEnv = {
  rowCount: 4,
  time: Float64Array.of(0, 0.5, 1, 1.5),
  resolve: (name) => (columns[name] ? Float64Array.from(columns[name]) : undefined),
};
const run = (src: string, e: EvalEnv = env) => Array.from(evaluateFormula(parseFormula(src), e));
const errorPos = (src: string) => {
  try {
    run(src);
  } catch (e) {
    if (e instanceof FormulaError) return { pos: e.pos, message: e.message };
    throw e;
  }
  throw new Error('no error');
};

describe('arithmetic', () => {
  test('scalars broadcast against columns', () => {
    expect(run('[A] * 2 + 1')).toEqual([3, 5, NaN, 9]);
    expect(run('3')).toEqual([3, 3, 3, 3]);
    expect(run('-[A] ^ 2')).toEqual([-1, -4, NaN, -16]);
  });
  test('division by zero and other non-finite results are NaN', () => {
    expect(run('[A] / [B]')).toEqual([0.1, NaN, NaN, 2]);
    expect(run('1 / 0')).toEqual([NaN, NaN, NaN, NaN]);
    expect(run('sqrt(-1)')).toEqual([NaN, NaN, NaN, NaN]);
  });
});

describe('comparisons and logic', () => {
  test('comparisons give 1/0 and propagate NaN', () => {
    expect(run('[A] > 1')).toEqual([0, 1, NaN, 1]);
    expect(run('[B] == 0')).toEqual([0, 1, 0, 0]);
  });
  test('and / or / not', () => {
    expect(run('[A] > 1 and [B] > 1')).toEqual([0, 0, NaN, 1]);
    expect(run('[A] > 1 or [B] > 1')).toEqual([1, 1, NaN, 1]);
    expect(run('not ([B] == 0)')).toEqual([1, 0, 1, 1]);
  });
  test('if picks per row and is NaN when the condition is', () => {
    expect(run('if([A] > 1, [B], -1)')).toEqual([-1, 0, NaN, 2]);
  });
});

describe('functions', () => {
  test('point-wise helpers', () => {
    expect(run('abs(-[B])')).toEqual([10, 0, 5, 2]);
    expect(run('min([A], [B])')).toEqual([1, 0, NaN, 2]);
    expect(run('max([A], 3)')).toEqual([3, 3, NaN, 4]);
    expect(run('clamp([B], 1, 5)')).toEqual([5, 1, 5, 2]);
    expect(run('round(2.5) + floor(1.9) + ceil(0.1)')).toEqual([5, 5, 5, 5]);
  });
  test('time is available as t', () => {
    expect(run('t * 2')).toEqual([0, 1, 2, 3]);
  });
  test('delta and rate', () => {
    expect(run('delta([B])')).toEqual([NaN, -10, 5, -3]);
    expect(run('rate([B])')).toEqual([NaN, -20, 10, -6]);
  });
  test('rate is NaN where time does not advance', () => {
    const e: EvalEnv = { ...env, time: Float64Array.of(0, 1, 1, 3) };
    expect(run('rate([B])', e)).toEqual([NaN, -10, NaN, -1.5]);
  });
  test('smooth averages a centred window of finite values; gaps stay gaps', () => {
    expect(run('smooth([A], 3)')).toEqual([1.5, 1.5, NaN, 4]);
  });
  test('lag shifts and pads with NaN', () => {
    expect(run('lag([A], 2)')).toEqual([NaN, NaN, 1, 2]);
    expect(run('lag([A], 0)')).toEqual([1, 2, NaN, 4]);
  });
});

describe('errors', () => {
  test('unknown channel, function and wrong arity point at the culprit', () => {
    expect(errorPos('1 + [Boost]')).toMatchObject({
      pos: 4,
      message: expect.stringContaining('Boost'),
    });
    expect(errorPos('foo(1)')).toMatchObject({ pos: 0, message: expect.stringContaining('foo') });
    expect(errorPos('abs(1, 2)')).toMatchObject({ pos: 0 });
  });
  test('window sizes must be literal whole numbers', () => {
    expect(errorPos('smooth([A], [B])').pos).toBe(0);
    expect(errorPos('smooth([A], 0)').pos).toBe(0);
    expect(errorPos('lag([A], 1.5)').pos).toBe(0);
  });
});

test('a 1M-row, three-reference formula evaluates in under 100 ms', () => {
  const n = 1_000_000;
  const col = (k: number) => Float64Array.from({ length: n }, (_, i) => (i % 1000) + k);
  const big: EvalEnv = {
    rowCount: n,
    time: Float64Array.from({ length: n }, (_, i) => i / 20),
    resolve: (name) => ({ A: col(1), B: col(2), C: col(3) })[name],
  };
  const expr = parseFormula('[A] * 2 + [B] / [C]');
  const resolved = { A: col(1), B: col(2), C: col(3) };
  const fast: EvalEnv = { ...big, resolve: (name) => resolved[name as 'A' | 'B' | 'C'] };
  // Best of three, so a busy test machine doesn't make this flaky; shared CI runners get 2x.
  let best = Infinity;
  let out: Float64Array = new Float64Array(0);
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    out = evaluateFormula(expr, fast);
    best = Math.min(best, performance.now() - start);
  }
  expect(best).toBeLessThan(process.env.CI ? 200 : 100);
  expect(out.length).toBe(n);
});
