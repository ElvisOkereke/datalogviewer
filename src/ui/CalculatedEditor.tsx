import { useEffect, useRef, useState } from 'react';
import { formatValue } from '@/charts/buildOptions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { withCalculated, type CalculatedDef } from '@/data/calculated';
import { findChannel } from '@/data/channels';
import { evaluateFormula } from '@/data/formula/evaluate';
import { formulaSize, MAX_TOTAL_FORMULA_NODES, parseFormula } from '@/data/formula/parse';
import { FormulaError } from '@/data/formula/tokenize';
import { finiteMinMax } from '@/data/stats';
import type { Log } from '@/data/types';
import { cn } from '@/lib/utils';
import { MAX_EXPRESSION_CHARS, MAX_NAME_CHARS } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';

type Check = { ok: true; summary: string } | { ok: false; message: string } | null;

const DRAFT_ID = '__draft__';

/**
 * Runs the draft through the same resolution the saved channel will get, alongside the other
 * definitions, so references by header and cycles through other channels are judged the same way
 * as after saving. Returns the error for the draft, if any. Those errors don't depend on the data,
 * so this runs on the first row only and stays cheap however many definitions there are.
 */
function checkInContext(
  log: Log,
  calculated: CalculatedDef[],
  draft: Omit<CalculatedDef, 'id'>,
  editingId?: string,
): string | undefined {
  const rows = Math.min(1, log.rowCount);
  const fileLog: Log = {
    ...log,
    rowCount: rows,
    time: log.time.subarray(0, rows),
    channels: log.channels
      .filter((c) => c.kind !== 'calculated')
      .map((c) => ({
        ...c,
        values: c.values?.subarray(0, rows) ?? null,
        text: c.text?.slice(0, rows) ?? null,
      })),
  };
  const id = editingId ?? DRAFT_ID;
  const defs = editingId
    ? calculated.map((d) => (d.id === editingId ? { ...draft, id } : d))
    : [...calculated, { ...draft, id }];
  const total = defs.reduce((n, d) => n + formulaSize(d.expression), 0);
  if (total > MAX_TOTAL_FORMULA_NODES) {
    return `Calculated channels are too complex in total (over ${MAX_TOTAL_FORMULA_NODES} parts)`;
  }
  return withCalculated(fileLog, defs).errors[id];
}

const VALIDATE_DELAY_MS = 200;

/** The log as the formula sees it: without the channel being edited (no self-reference). */
function logWithout(log: Log, editingId?: string): Log {
  if (!editingId) return log;
  return { ...log, channels: log.channels.filter((c) => c.id !== `calc:${editingId}`) };
}

function checkExpression(expression: string, log: Log): Check {
  if (!expression.trim()) return null;
  try {
    const values = evaluateFormula(parseFormula(expression), {
      rowCount: log.rowCount,
      time: log.time,
      resolve: (name) => {
        const ch = findChannel(log, name);
        return ch && ch.kind !== 'text' ? (ch.values ?? undefined) : undefined;
      },
    });
    const { min, max } = finiteMinMax(values);
    let count = 0;
    for (const v of values) if (v === v) count++;
    return {
      ok: true,
      summary: `min ${formatValue(min)} · max ${formatValue(max)} · ${count.toLocaleString('en-US')} values`,
    };
  } catch (e) {
    if (e instanceof FormulaError)
      return { ok: false, message: `${e.message} at character ${e.pos + 1}` };
    return { ok: false, message: String(e) };
  }
}

export function CalculatedEditor({
  open,
  onOpenChange,
  log,
  editing,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The workbench log (file + calculated channels). */
  log: Log;
  editing?: CalculatedDef;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [expression, setExpression] = useState('');
  // The check and the inputs it was made for; Save needs them to match what is typed now.
  const [checked, setChecked] = useState<{ key: string; check: Check }>({ key: '', check: null });
  const exprRef = useRef<HTMLTextAreaElement>(null);
  const calculated = useLayoutStore((s) => s.calculated);
  const base = logWithout(log, editing?.id);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setUnit(editing?.unit ?? '');
    setExpression(editing?.expression ?? '');
    setChecked({ key: '', check: null });
  }, [open, editing]);

  const trimmed = name.trim();
  const draft = {
    name: trimmed || editing?.name || DRAFT_ID,
    unit: unit.trim() || undefined,
    expression: expression.trim(),
  };
  const key = JSON.stringify(draft);
  useEffect(() => {
    const id = setTimeout(() => {
      let check = checkExpression(expression, base);
      if (check?.ok) {
        const error = checkInContext(log, calculated, draft, editing?.id);
        if (error) check = { ok: false, message: error };
      }
      setChecked({ key, check });
    }, VALIDATE_DELAY_MS);
    return () => clearTimeout(id);
    // `base` and `draft` are derived from log, editing and the inputs (captured by `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, log, editing, calculated]);
  const check = checked.key === key ? checked.check : null;
  // While a new check is pending the last result stays on screen (no flicker), but can't save.
  const shown = expression.trim() ? checked.check : null;
  const taken =
    base.channels.some(
      (c) =>
        c.name.toLowerCase() === trimmed.toLowerCase() ||
        c.header.toLowerCase() === trimmed.toLowerCase(),
    ) ||
    calculated.some((d) => d.id !== editing?.id && d.name.toLowerCase() === trimmed.toLowerCase());
  const nameProblem = !trimmed
    ? null
    : trimmed.length > MAX_NAME_CHARS
      ? 'Name is too long'
      : taken
        ? 'Name already used'
        : null;
  const canSave =
    !!trimmed && !nameProblem && check?.ok === true && expression.length <= MAX_EXPRESSION_CHARS;

  const insert = (header: string) => {
    const el = exprRef.current;
    const at = el?.selectionStart ?? expression.length;
    const end = el?.selectionEnd ?? at;
    // The plain name reads better ("[MAP]", not "[MAP [kPa]]") when it finds the same channel.
    const ch = findChannel(base, header);
    const text = `[${ch && findChannel(base, ch.name) === ch ? ch.name : header}]`;
    setExpression(expression.slice(0, at) + text + expression.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  };

  const save = () => {
    const def = { name: trimmed, expression: expression.trim(), unit: unit.trim() || undefined };
    const store = useLayoutStore.getState();
    if (editing) store.updateCalculated(editing.id, def);
    else store.addCalculated(def);
    onOpenChange(false);
  };

  const insertable = base.channels.filter((c) => c.kind !== 'text');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit calculated channel' : 'New calculated channel'}
          </DialogTitle>
          <DialogDescription>
            Use channel names in brackets, e.g. <code className="num">[AFR] / 14.7</code>.
            Functions: abs, min, max, clamp, if, round, sqrt, delta, rate, smooth(x, n), lag(x, n);
            time is <code className="num">t</code>.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) save();
          }}
        >
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME_CHARS}
                aria-label="Name"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Unit</span>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                maxLength={MAX_NAME_CHARS}
                aria-label="Unit"
              />
            </label>
          </div>
          {nameProblem && <p className="-mt-1 text-xs text-destructive">{nameProblem}</p>}
          <div className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-xs text-muted-foreground">
              Expression
              <select
                aria-label="Insert channel"
                value=""
                onChange={(e) => e.target.value && insert(e.target.value)}
                className="rounded-sm border border-input bg-background px-1 py-0.5 text-xs text-foreground"
              >
                <option value="">Insert channel…</option>
                {insertable.map((c) => (
                  <option key={c.id} value={c.header}>
                    {c.header}
                  </option>
                ))}
              </select>
            </span>
            <textarea
              ref={exprRef}
              aria-label="Expression"
              value={expression}
              maxLength={MAX_EXPRESSION_CHARS}
              onChange={(e) => setExpression(e.target.value)}
              rows={3}
              spellCheck={false}
              className="num rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <p
            aria-live="polite"
            className={cn(
              'min-h-5 text-xs',
              shown?.ok === false ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {shown === null ? 'Enter a formula.' : shown.ok ? shown.summary : shown.message}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
