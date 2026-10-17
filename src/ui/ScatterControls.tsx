import type { ScatterScope } from '@/charts/scatterData';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Log } from '@/data/types';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';

const selectClass =
  'h-7 max-w-48 rounded-sm border border-input bg-background px-1.5 text-xs text-foreground';

/** X / Y / Colour-by pickers and the scope switch for the scatter view. */
export function ScatterControls({
  log,
  scope,
  onScope,
}: {
  log: Log;
  scope: ScatterScope;
  onScope(scope: ScatterScope): void;
}) {
  const cfg = useLayoutStore((s) => s.scatter) ?? { x: '', y: '' };
  const hasSelection = useViewStore((s) => s.selection !== null);
  const options = log.channels.filter((c) => c.values);
  const update = (patch: { x?: string; y?: string; color?: string }) => {
    const next = { ...cfg, ...patch };
    if (!next.color) delete next.color;
    useLayoutStore.getState().setScatter(next);
  };
  const picker = (label: string, value: string, onChange: (v: string) => void, none?: string) => (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        {none !== undefined && <option value="">{none}</option>}
        {!none && !value && <option value="">Choose…</option>}
        {options.map((c) => (
          <option key={c.id} value={c.header}>
            {c.header}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-panel px-3 py-2">
      {picker('X axis', cfg.x, (x) => update({ x }))}
      {picker('Y axis', cfg.y, (y) => update({ y }))}
      {picker('Colour by', cfg.color ?? '', (color) => update({ color }), 'None')}
      <span className="flex-1" />
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        aria-label="Points from"
        value={scope}
        onValueChange={(v) => v && onScope(v as ScatterScope)}
      >
        <ToggleGroupItem value="view" className="px-2.5 text-xs">
          View
        </ToggleGroupItem>
        <ToggleGroupItem value="selection" className="px-2.5 text-xs" disabled={!hasSelection}>
          Selection
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="px-2.5 text-xs">
          Whole log
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
