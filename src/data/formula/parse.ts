import { FormulaError, FormulaTooComplexError, tokenize, type Token } from './tokenize';

/**
 * Most parts (numbers, references, operators, calls) a formula may have. Each part is a pass over
 * every row, so this bounds the cost of a formula on a 1M-row log to a fraction of a second.
 */
export const MAX_FORMULA_NODES = 250;
/** Most parts across all calculated channels together (every one is evaluated on each log). */
export const MAX_TOTAL_FORMULA_NODES = 2000;

function nodeCount(e: Expr): number {
  if (e.type === 'unary') return 1 + nodeCount(e.arg);
  if (e.type === 'binary') return 1 + nodeCount(e.left) + nodeCount(e.right);
  if (e.type === 'call') return e.args.reduce((n, a) => n + nodeCount(a), 1);
  return 1;
}

export type BinaryOp =
  '+' | '-' | '*' | '/' | '^' | '<' | '<=' | '>' | '>=' | '==' | '!=' | 'and' | 'or';

export type Expr =
  | { type: 'num'; value: number; pos: number }
  | { type: 'ref'; name: string; pos: number }
  | { type: 'time'; pos: number }
  | { type: 'unary'; op: '-' | 'not'; arg: Expr; pos: number }
  | { type: 'binary'; op: BinaryOp; left: Expr; right: Expr; pos: number }
  | { type: 'call'; fn: string; args: Expr[]; pos: number };

const COMPARISONS = new Set(['<', '<=', '>', '>=', '==', '!=']);

/**
 * Parses a calculated-channel formula. Precedence, lowest first: or, and, not, comparison
 * (non-chaining), + -, * /, unary minus, ^ (right-associative, tighter than unary minus).
 */
export function parseFormula(src: string): Expr {
  const tokens = tokenize(src);
  let i = 0;
  const peek = (): Token => tokens[i];
  const next = (): Token => tokens[i++];
  const isOp = (t: Token, ...ops: string[]) => t.kind === 'op' && ops.includes(t.text);
  const isWord = (t: Token, word: string) => t.kind === 'ident' && t.text === word;
  const describe = (t: Token) => (t.kind === 'eof' ? 'end of formula' : `'${t.text}'`);

  const or = (): Expr => {
    let left = and();
    while (isWord(peek(), 'or')) {
      const { pos } = next();
      left = { type: 'binary', op: 'or', left, right: and(), pos };
    }
    return left;
  };
  const and = (): Expr => {
    let left = not();
    while (isWord(peek(), 'and')) {
      const { pos } = next();
      left = { type: 'binary', op: 'and', left, right: not(), pos };
    }
    return left;
  };
  const not = (): Expr => {
    if (isWord(peek(), 'not')) {
      const { pos } = next();
      return { type: 'unary', op: 'not', arg: not(), pos };
    }
    return comparison();
  };
  const comparison = (): Expr => {
    const left = additive();
    const t = peek();
    if (t.kind !== 'op' || !COMPARISONS.has(t.text)) return left;
    next();
    const expr: Expr = {
      type: 'binary',
      op: t.text as BinaryOp,
      left,
      right: additive(),
      pos: t.pos,
    };
    const after = peek();
    if (after.kind === 'op' && COMPARISONS.has(after.text)) {
      throw new FormulaError("Comparisons can't be chained — use 'and'", after.pos);
    }
    return expr;
  };
  const additive = (): Expr => {
    let left = term();
    while (isOp(peek(), '+', '-')) {
      const t = next();
      left = { type: 'binary', op: t.text as BinaryOp, left, right: term(), pos: t.pos };
    }
    return left;
  };
  const term = (): Expr => {
    let left = unary();
    while (isOp(peek(), '*', '/')) {
      const t = next();
      left = { type: 'binary', op: t.text as BinaryOp, left, right: unary(), pos: t.pos };
    }
    return left;
  };
  const unary = (): Expr => {
    if (isOp(peek(), '-')) {
      const { pos } = next();
      return { type: 'unary', op: '-', arg: unary(), pos };
    }
    return power();
  };
  const power = (): Expr => {
    const base = primary();
    if (!isOp(peek(), '^')) return base;
    const { pos } = next();
    return { type: 'binary', op: '^', left: base, right: unary(), pos };
  };
  const primary = (): Expr => {
    const t = next();
    if (t.kind === 'num') return { type: 'num', value: t.value!, pos: t.pos };
    if (t.kind === 'channel') return { type: 'ref', name: t.text, pos: t.pos };
    if (t.kind === 'lparen') {
      const inner = or();
      const close = peek();
      if (close.kind !== 'rparen') throw new FormulaError("Expected ')'", close.pos);
      next();
      return inner;
    }
    if (t.kind === 'ident' && !['and', 'or', 'not'].includes(t.text)) {
      if (t.text === 'pi') return { type: 'num', value: Math.PI, pos: t.pos };
      if (t.text === 't') return { type: 'time', pos: t.pos };
      if (peek().kind === 'lparen') return call(t);
      return { type: 'ref', name: t.text, pos: t.pos };
    }
    throw new FormulaError(`Expected a value, found ${describe(t)}`, t.pos);
  };
  const call = (fn: Token): Expr => {
    next(); // (
    const args: Expr[] = [];
    if (peek().kind !== 'rparen') {
      args.push(or());
      while (peek().kind === 'comma') {
        next();
        args.push(or());
      }
    }
    const close = peek();
    if (close.kind !== 'rparen') throw new FormulaError("Expected ')' or ','", close.pos);
    next();
    return { type: 'call', fn: fn.text, args, pos: fn.pos };
  };

  const expr = or();
  const end = peek();
  if (end.kind !== 'eof') throw new FormulaError(`Unexpected ${describe(end)}`, end.pos);
  if (nodeCount(expr) > MAX_FORMULA_NODES) {
    throw new FormulaTooComplexError(
      `Formula is too complex (more than ${MAX_FORMULA_NODES} parts)`,
      0,
    );
  }
  return expr;
}

/**
 * Parts in a formula, for the total budget: 0 when it doesn't parse (it never runs), and over
 * MAX_FORMULA_NODES when it is too complex on its own.
 */
export function formulaSize(src: string): number {
  try {
    return nodeCount(parseFormula(src));
  } catch (e) {
    return e instanceof FormulaTooComplexError ? MAX_FORMULA_NODES + 1 : 0;
  }
}

/** True only when the formula parses but is over MAX_FORMULA_NODES (syntax errors are false). */
export function isOverComplex(src: string): boolean {
  try {
    parseFormula(src);
    return false;
  } catch (e) {
    return e instanceof FormulaTooComplexError;
  }
}

/** Channel names the formula refers to, each once, in order of appearance. */
export function referencedNames(e: Expr): string[] {
  const names: string[] = [];
  const visit = (n: Expr) => {
    if (n.type === 'ref' && !names.includes(n.name)) names.push(n.name);
    if (n.type === 'unary') visit(n.arg);
    if (n.type === 'binary') {
      visit(n.left);
      visit(n.right);
    }
    if (n.type === 'call') n.args.forEach(visit);
  };
  visit(e);
  return names;
}
