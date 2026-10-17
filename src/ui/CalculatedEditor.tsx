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
import type { CalculatedDef } from '@/data/calculated';
import { findChannel } from '@/data/channels';
import { evaluateFormula } from '@/data/formula/evaluate';
import { parseFormula } from '@/data/formula/parse';
import { FormulaError } from '@/data/formula/tokenize';
import { finiteMinMax } from '@/data/stats';
import type { Log } from '@/data/types';
import { cn } from '@/lib/utils';
import { MAX_EXPRESSION_CHARS, MAX_NAME_CHARS } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';

type Check = { ok: true; summary: string } | { ok: false; message: string } | null;

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
  const [check, setCheck] = useState<Check>(null);
  const exprRef = useRef<HTMLTextAreaElement>(null);
  const calculated = useLayoutStore((s) => s.calculated);
  const base = logWithout(log, editing?.id);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setUnit(editing?.unit ?? '');
    setExpression(editing?.expression ?? '');
    setCheck(null);
  }, [open, editing]);

  useEffect(() => {
    const id = setTimeout(() => setCheck(checkExpression(expression, base)), VALIDATE_DELAY_MS);
    return () => clearTimeout(id);
    // `base` is derived from log + editing; re-check when those or the text change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, log, editing]);

  const trimmed = name.trim();
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
    const text = `[${header}]`;
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
              <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Unit</span>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" />
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
              check?.ok === false ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {check === null ? 'Enter a formula.' : check.ok ? check.summary : check.message}
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
