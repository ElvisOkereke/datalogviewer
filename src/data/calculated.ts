import { findChannel, splitHeaderUnit } from './channels';
import { evaluateFormula } from './formula/evaluate';
import { parseFormula, referencedNames, type Expr } from './formula/parse';
import { FormulaError } from './formula/tokenize';
import { finiteMinMax } from './stats';
import type { Channel, Log } from './types';

/** A formula channel definition (stored in the layout). */
export interface CalculatedDef {
  id: string;
  name: string;
  unit?: string;
  expression: string;
}

const describeError = (e: unknown) =>
  e instanceof FormulaError ? `${e.message} at character ${e.pos + 1}` : String(e);

/**
 * Evaluates calculated-channel definitions against a log and appends them as channels.
 * Definitions may reference file channels or each other (by name, case-insensitive), in any
 * order. Failures — syntax errors, missing channels, cycles — are reported per definition id and
 * leave the other definitions unaffected.
 */
export function withCalculated(
  log: Log,
  defs: CalculatedDef[],
): { log: Log; errors: Record<string, string> } {
  if (defs.length === 0) return { log, errors: {} };

  const errors: Record<string, string> = {};
  const parsed = new Map<string, Expr>();
  // Same rule as findChannel: exact header ("Lambda (λ)") first, then name, case-insensitive.
  const headerOf = (d: CalculatedDef) => (d.unit ? `${d.name} (${d.unit})` : d.name);
  const byHeader = new Map(defs.map((d) => [headerOf(d), d]));
  const byName = new Map(defs.map((d) => [d.name.toLowerCase(), d]));
  const findDef = (ref: string) =>
    byHeader.get(ref) ?? byName.get(splitHeaderUnit(ref).name.toLowerCase());
  for (const def of defs) {
    try {
      parsed.set(def.id, parseFormula(def.expression));
    } catch (e) {
      errors[def.id] = describeError(e);
    }
  }

  const fileValues = (name: string) => {
    const ch = findChannel(log, name);
    return ch && ch.kind !== 'text' ? (ch.values ?? undefined) : undefined;
  };

  // Depth-first evaluation in dependency order; `active` detects cycles.
  const results = new Map<string, Float64Array>();
  const active: string[] = [];
  const visit = (def: CalculatedDef): Float64Array | undefined => {
    if (results.has(def.id)) return results.get(def.id);
    if (errors[def.id]) return undefined;
    if (active.includes(def.id)) {
      for (const id of active.slice(active.indexOf(def.id))) {
        const name = defs.find((d) => d.id === id)!.name;
        errors[id] = `[${name}] refers to itself (through other calculated channels)`;
      }
      return undefined;
    }
    const expr = parsed.get(def.id)!;
    active.push(def.id);
    for (const name of referencedNames(expr)) {
      if (fileValues(name)) continue;
      const dep = findDef(name);
      if (!dep || dep.id === def.id) {
        errors[def.id] ??= dep ? `[${def.name}] refers to itself` : `needs [${name}]`;
        break;
      }
      if (!visit(dep)) {
        errors[def.id] ??= errors[dep.id]?.includes('refers to itself')
          ? errors[dep.id]
          : `needs [${dep.name}]`;
        break;
      }
    }
    active.pop();
    if (errors[def.id]) return undefined;
    try {
      const values = evaluateFormula(expr, {
        rowCount: log.rowCount,
        time: log.time,
        resolve: (name) => fileValues(name) ?? results.get(findDef(name)?.id ?? ''),
      });
      results.set(def.id, values);
      return values;
    } catch (e) {
      errors[def.id] = describeError(e);
      return undefined;
    }
  };
  defs.forEach(visit);

  const channels: Channel[] = defs.flatMap((def) => {
    const values = results.get(def.id);
    if (!values) return [];
    const { min, max } = finiteMinMax(values);
    return [
      {
        id: `calc:${def.id}`,
        header: headerOf(def),
        name: def.name,
        unit: def.unit,
        kind: 'calculated' as const,
        values,
        text: null,
        min,
        max,
      },
    ];
  });
  return { log: { ...log, channels: [...log.channels, ...channels] }, errors };
}
