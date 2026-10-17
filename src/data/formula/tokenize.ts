/** A formula problem at a character position (0-based), for pointing at it in the editor. */
export class FormulaError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'FormulaError';
    this.pos = pos;
  }
}

/** The formula has more parts than MAX_FORMULA_NODES. */
export class FormulaTooComplexError extends FormulaError {}

export type TokenKind = 'num' | 'ident' | 'channel' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  pos: number;
  value?: number;
}

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const OPERATORS = ['<=', '>=', '==', '!=', '<', '>', '+', '-', '*', '/', '^'];

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const rest = src.slice(i);
    const num = NUMBER.exec(rest);
    if (num) {
      tokens.push({ kind: 'num', text: num[0], pos: i, value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    if (ch === '[') {
      // Brackets inside a name balance, so headers like "MAP [kPa]" can be referenced whole.
      let close = -1;
      for (let j = i, depth = 0; j < src.length; j++) {
        if (src[j] === '[') depth++;
        else if (src[j] === ']' && --depth === 0) {
          close = j;
          break;
        }
      }
      if (close < 0) throw new FormulaError("Unterminated '[' — channel names end with ']'", i);
      tokens.push({ kind: 'channel', text: src.slice(i + 1, close).trim(), pos: i });
      i = close + 1;
      continue;
    }
    const ident = IDENT.exec(rest);
    if (ident) {
      tokens.push({ kind: 'ident', text: ident[0], pos: i });
      i += ident[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op) {
      tokens.push({ kind: 'op', text: op, pos: i });
      i += op.length;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({
        kind: ch === '(' ? 'lparen' : ch === ')' ? 'rparen' : 'comma',
        text: ch,
        pos: i,
      });
      i++;
      continue;
    }
    throw new FormulaError(`Unexpected '${ch}'`, i);
  }
  tokens.push({ kind: 'eof', text: '', pos: src.length });
  return tokens;
}
