import { describe, expect, test } from 'vitest';
import { parseFormula, referencedNames, type Expr } from '@/data/formula/parse';
import { FormulaError } from '@/data/formula/tokenize';

/** Compact s-expression view of a tree, ignoring positions. */
function show(e: Expr): string {
  switch (e.type) {
    case 'num':
      return String(e.value);
    case 'ref':
      return `[${e.name}]`;
    case 'time':
      return 't';
    case 'unary':
      return `(${e.op} ${show(e.arg)})`;
    case 'binary':
      return `(${e.op} ${show(e.left)} ${show(e.right)})`;
    case 'call':
      return `(${e.fn} ${e.args.map(show).join(' ')})`;
  }
}
const p = (src: string) => show(parseFormula(src));

function errorOf(src: string): { message: string; pos: number } {
  try {
    parseFormula(src);
  } catch (e) {
    if (e instanceof FormulaError) return { message: e.message, pos: e.pos };
    throw e;
  }
  throw new Error(`no error for ${src}`);
}

describe('parseFormula', () => {
  test('arithmetic precedence', () => {
    expect(p('1 + 2 * 3')).toBe('(+ 1 (* 2 3))');
    expect(p('(1 + 2) * 3')).toBe('(* (+ 1 2) 3)');
    expect(p('8 / 4 / 2')).toBe('(/ (/ 8 4) 2)');
  });

  test('power binds tighter than unary minus and is right-associative', () => {
    expect(p('-2 ^ 2')).toBe('(- (^ 2 2))');
    expect(p('2 ^ 3 ^ 2')).toBe('(^ 2 (^ 3 2))');
  });

  test('bracketed channel names keep spaces and units', () => {
    expect(p('[MAP (kPa)] / 100 - 1')).toBe('(- (/ [MAP (kPa)] 100) 1)');
  });

  test('bare identifiers, comparisons and logic', () => {
    expect(p('RPM > 3000 and not [Decel]')).toBe('(and (> [RPM] 3000) (not [Decel]))');
    expect(p('a or b and c')).toBe('(or [a] (and [b] [c]))');
  });

  test('function calls, time and constants', () => {
    expect(p('if(TPS > 90, AFR, 0)')).toBe('(if (> [TPS] 90) [AFR] 0)');
    expect(p('smooth([AFR], 5)')).toBe('(smooth [AFR] 5)');
    expect(p('t')).toBe('t');
    expect(parseFormula('pi')).toMatchObject({ type: 'num', value: Math.PI });
    expect(p('1.5e3 + .5')).toBe('(+ 1500 0.5)');
  });

  test('errors carry the character position', () => {
    expect(errorOf('1 +')).toMatchObject({ pos: 3 });
    expect(errorOf('(1')).toMatchObject({
      message: expect.stringContaining("Expected ')'"),
      pos: 2,
    });
    expect(errorOf('[RPM')).toMatchObject({
      message: expect.stringContaining('Unterminated'),
      pos: 0,
    });
    expect(errorOf('1 $ 2')).toMatchObject({ message: expect.stringContaining("'$'"), pos: 2 });
    expect(errorOf('')).toMatchObject({ pos: 0 });
    expect(errorOf('1 2')).toMatchObject({ pos: 2 });
  });

  test('comparisons do not chain', () => {
    expect(errorOf('1 < 2 < 3').pos).toBe(6);
  });
});

test('referencedNames lists each channel once, in order', () => {
  expect(referencedNames(parseFormula('[A] + B * [A] + smooth(C, 3)'))).toEqual(['A', 'B', 'C']);
  expect(referencedNames(parseFormula('t * pi'))).toEqual([]);
});
