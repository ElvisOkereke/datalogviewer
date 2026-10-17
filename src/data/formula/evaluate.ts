import type { Expr } from './parse';
import { FormulaError } from './tokenize';

export interface EvalEnv {
  rowCount: number;
  /** Seconds (or row numbers) for `t`, `rate`. */
  time: Float64Array;
  resolve(name: string): Float64Array | undefined;
}

/** A value during evaluation: a scalar until something makes it a column. */
type Value = number | Float64Array;

const finite = (v: number) => (Number.isFinite(v) ? v : NaN);

function column(v: Value, n: number): Float64Array {
  return typeof v === 'number' ? new Float64Array(n).fill(finite(v)) : v;
}

/** Applies `f` element-wise, broadcasting scalars; every result that isn't finite becomes NaN. */
function map2(a: Value, b: Value, n: number, f: (x: number, y: number) => number): Value {
  if (typeof a === 'number' && typeof b === 'number') return finite(f(a, b));
  const out = new Float64Array(n);
  if (typeof a === 'number') {
    const bb = b as Float64Array;
    for (let i = 0; i < n; i++) out[i] = finite(f(a, bb[i]));
  } else if (typeof b === 'number') {
    for (let i = 0; i < n; i++) out[i] = finite(f(a[i], b));
  } else {
    for (let i = 0; i < n; i++) out[i] = finite(f(a[i], b[i]));
  }
  return out;
}

function map1(a: Value, n: number, f: (x: number) => number): Value {
  if (typeof a === 'number') return finite(f(a));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = finite(f(a[i]));
  return out;
}

const isNaNv = (x: number) => x !== x;
const truth = (x: number) => x !== 0;
const BINARY: Record<string, (x: number, y: number) => number> = {
  '+': (x, y) => x + y,
  '-': (x, y) => x - y,
  '*': (x, y) => x * y,
  '/': (x, y) => x / y,
  '^': (x, y) => x ** y,
  '<': (x, y) => (isNaNv(x) || isNaNv(y) ? NaN : x < y ? 1 : 0),
  '<=': (x, y) => (isNaNv(x) || isNaNv(y) ? NaN : x <= y ? 1 : 0),
  '>': (x, y) => (isNaNv(x) || isNaNv(y) ? NaN : x > y ? 1 : 0),
  '>=': (x, y) => (isNaNv(x) || isNaNv(y) ? NaN : x >= y ? 1 : 0),
  '==': (x, y) => (isNaNv(x) || isNaNv(y) ? NaN : x === y ? 1 : 0),
  '!=': (x, y) => (isNaNv(x) || isNaNv(y) ? NaN : x !== y ? 1 : 0),
  and: (x, y) => (isNaNv(x) || isNaNv(y) ? NaN : truth(x) && truth(y) ? 1 : 0),
  or: (x, y) => (isNaNv(x) || isNaNv(y) ? NaN : truth(x) || truth(y) ? 1 : 0),
};

const POINTWISE: Record<string, (x: number) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  log: Math.log,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
};

/** Function names → allowed argument counts (for messages and the editor). */
export const FUNCTIONS: Record<string, [min: number, max: number]> = {
  ...Object.fromEntries(Object.keys(POINTWISE).map((k) => [k, [1, 1]])),
  min: [2, Infinity],
  max: [2, Infinity],
  clamp: [3, 3],
  if: [3, 3],
  delta: [1, 1],
  rate: [1, 1],
  smooth: [2, 2],
  lag: [2, 2],
};

/** A window size given as a literal whole number (so it is known before evaluation). */
function literalCount(e: Expr, fn: string, min: number, callPos: number): number {
  if (e.type !== 'num' || !Number.isInteger(e.value) || e.value < min) {
    throw new FormulaError(
      `${fn}() needs a whole number of samples ≥ ${min} as its second argument`,
      callPos,
    );
  }
  return e.value;
}

/**
 * Evaluates a parsed formula column-wise into one value per row. Missing values (NaN) propagate,
 * and anything non-finite (e.g. division by zero) becomes NaN.
 */
export function evaluateFormula(expr: Expr, env: EvalEnv): Float64Array {
  const n = env.rowCount;

  const ev = (e: Expr): Value => {
    switch (e.type) {
      case 'num':
        return e.value;
      case 'time':
        return env.time;
      case 'ref': {
        const values = env.resolve(e.name);
        if (!values) throw new FormulaError(`Unknown channel [${e.name}]`, e.pos);
        return values;
      }
      case 'unary':
        return e.op === '-'
          ? map1(ev(e.arg), n, (x) => -x)
          : map1(ev(e.arg), n, (x) => (isNaNv(x) ? NaN : truth(x) ? 0 : 1));
      case 'binary':
        return map2(ev(e.left), ev(e.right), n, BINARY[e.op]);
      case 'call':
        return call(e);
    }
  };

  const call = (e: Extract<Expr, { type: 'call' }>): Value => {
    const arity = FUNCTIONS[e.fn];
    if (!arity) throw new FormulaError(`Unknown function ${e.fn}()`, e.pos);
    const [min, max] = arity;
    if (e.args.length < min || e.args.length > max) {
      const want = min === max ? `${min}` : max === Infinity ? `at least ${min}` : `${min}–${max}`;
      throw new FormulaError(
        `${e.fn}() takes ${want} argument${min === 1 && max === 1 ? '' : 's'}`,
        e.pos,
      );
    }
    if (POINTWISE[e.fn]) return map1(ev(e.args[0]), n, POINTWISE[e.fn]);

    switch (e.fn) {
      case 'min':
      case 'max': {
        const pick = e.fn === 'min' ? Math.min : Math.max;
        return e.args.map(ev).reduce((acc, v) => map2(acc, v, n, pick));
      }
      case 'clamp': {
        const [x, lo, hi] = e.args.map(ev);
        return map2(map2(x, lo, n, Math.max), hi, n, Math.min);
      }
      case 'if': {
        const [c, a, b] = e.args.map((arg) => column(ev(arg), n));
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = isNaNv(c[i]) ? NaN : truth(c[i]) ? a[i] : b[i];
        return out;
      }
      case 'delta': {
        const x = column(ev(e.args[0]), n);
        const out = new Float64Array(n);
        out[0] = NaN;
        for (let i = 1; i < n; i++) out[i] = finite(x[i] - x[i - 1]);
        return out;
      }
      case 'rate': {
        const x = column(ev(e.args[0]), n);
        const t = env.time;
        const out = new Float64Array(n);
        out[0] = NaN;
        for (let i = 1; i < n; i++) {
          const dt = t[i] - t[i - 1];
          out[i] = dt > 0 ? finite((x[i] - x[i - 1]) / dt) : NaN;
        }
        return out;
      }
      case 'smooth': {
        const size = literalCount(e.args[1], 'smooth', 1, e.pos);
        const x = column(ev(e.args[0]), n);
        const before = Math.floor((size - 1) / 2);
        const after = size - 1 - before;
        const out = new Float64Array(n);
        // Running sum over the window, counting only finite values.
        let sum = 0;
        let count = 0;
        const add = (j: number, sign: 1 | -1) => {
          const v = x[j];
          if (v === v) {
            sum += sign * v;
            count += sign;
          }
        };
        for (let j = 0; j <= Math.min(after, n - 1); j++) add(j, 1);
        for (let i = 0; i < n; i++) {
          out[i] = count > 0 ? sum / count : NaN;
          const enter = i + after + 1;
          const leave = i - before;
          if (enter < n) add(enter, 1);
          if (leave >= 0) add(leave, -1);
        }
        return out;
      }
      case 'lag': {
        const k = literalCount(e.args[1], 'lag', 0, e.pos);
        const x = column(ev(e.args[0]), n);
        const out = new Float64Array(n).fill(NaN);
        for (let i = k; i < n; i++) out[i] = x[i - k];
        return out;
      }
    }
    throw new FormulaError(`Unknown function ${e.fn}()`, e.pos);
  };

  return column(ev(expr), n);
}
