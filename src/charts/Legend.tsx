import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import type { Log } from '@/data/types';
import type { BoundPane, BoundSeries } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { formatValue } from './buildOptions';
import { resolveSeriesColor, SERIES_SLOTS } from './palette';

interface LegendProps {
  pane: BoundPane;
  log: Log;
  /** Temporarily shows this series' y-axis (null restores the default). */
  onHoverSeries(header: string | null): void;
  /** Keeps this series' y-axis shown. */
  onUseForAxis(header: string): void;
}

function useThemeMode(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function Legend({ pane, log, onHoverSeries, onUseForAxis }: LegendProps) {
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-x-1 gap-y-0.5 px-2 pt-1 text-xs">
      {pane.series.map((s) => (
        <LegendEntry
          key={s.header}
          paneId={pane.id}
          series={s}
          log={log}
          onHoverSeries={onHoverSeries}
          onUseForAxis={onUseForAxis}
        />
      ))}
    </div>
  );
}

function LegendEntry({
  paneId,
  series,
  onHoverSeries,
  onUseForAxis,
}: {
  paneId: string;
  series: BoundSeries;
  log: Log;
  onHoverSeries(header: string | null): void;
  onUseForAxis(header: string): void;
}) {
  const raw = useViewStore((s) => s.cursor);
  const cursor = raw != null && raw < (series.channel?.values?.length ?? 0) ? raw : null;
  const { removeSeries, setSeriesColor, setSeriesScale } = useLayoutStore.getState();
  const mode = useThemeMode();
  const [editingScale, setEditingScale] = useState(false);
  const keepFocusForEditor = useRef(false);
  const ch = series.channel;
  const value = ch?.values && cursor != null ? ch.values[cursor] : null;
  const name = ch?.name ?? series.header;

  return (
    <Popover open={editingScale} onOpenChange={setEditingScale}>
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 hover:bg-accent"
              onMouseEnter={() => ch && onHoverSeries(series.header)}
              onMouseLeave={() => onHoverSeries(null)}
            >
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: resolveSeriesColor(series.color, mode) }}
                aria-hidden
              />
              <span className={ch ? 'text-muted-foreground' : 'text-muted-foreground line-through'}>
                {name}
              </span>
              {ch?.unit && <span className="text-muted-foreground/70">{ch.unit}</span>}
              {ch ? (
                <span className="num font-semibold text-foreground" data-testid="legend-value">
                  {formatValue(value)}
                </span>
              ) : (
                <span className="text-muted-foreground italic">not in this log</span>
              )}
            </button>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent
          align="start"
          onCloseAutoFocus={(e) => {
            if (keepFocusForEditor.current) {
              keepFocusForEditor.current = false;
              e.preventDefault();
            }
          }}
        >
          <DropdownMenuLabel>{series.header}</DropdownMenuLabel>
          {ch && (
            <DropdownMenuItem onSelect={() => onUseForAxis(series.header)}>
              Use for y-axis
            </DropdownMenuItem>
          )}
          {ch && (
            <DropdownMenuItem onSelect={() => setSeriesScale(paneId, series.header, undefined)}>
              Auto scale
            </DropdownMenuItem>
          )}
          {ch && (
            <DropdownMenuItem
              onSelect={() => {
                keepFocusForEditor.current = true;
                setEditingScale(true);
              }}
            >
              Set scale…
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <div className="grid grid-cols-8 gap-1 px-2 py-1.5">
            {SERIES_SLOTS[mode].map((hex, i) => (
              <DropdownMenuItem
                key={hex}
                aria-label={`Colour ${i + 1}`}
                className="size-5 justify-center rounded-sm p-0"
                onSelect={() => setSeriesColor(paneId, series.header, `s${i + 1}`)}
              >
                <span className="size-3.5 rounded-[2px]" style={{ background: hex }} />
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => removeSeries(paneId, series.header)}
          >
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent align="start" className="w-56">
        <ScaleEditor
          initial={series.scale}
          onApply={(scale) => {
            setSeriesScale(paneId, series.header, scale);
            setEditingScale(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ScaleEditor({
  initial,
  onApply,
}: {
  initial?: { min?: number; max?: number };
  onApply(scale: { min?: number; max?: number } | undefined): void;
}) {
  const [min, setMin] = useState(initial?.min?.toString() ?? '');
  const [max, setMax] = useState(initial?.max?.toString() ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const scale: { min?: number; max?: number } = {};
    if (min.trim() !== '' && Number.isFinite(Number(min))) scale.min = Number(min);
    if (max.trim() !== '' && Number.isFinite(Number(max))) scale.max = Number(max);
    onApply(Object.keys(scale).length ? scale : undefined);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 text-xs">
      <label className="flex items-center justify-between gap-2">
        Minimum
        <Input
          className="num h-7 w-28"
          inputMode="decimal"
          value={min}
          onChange={(e) => setMin(e.target.value)}
        />
      </label>
      <label className="flex items-center justify-between gap-2">
        Maximum
        <Input
          className="num h-7 w-28"
          inputMode="decimal"
          value={max}
          onChange={(e) => setMax(e.target.value)}
        />
      </label>
      <Button type="submit" size="sm">
        Apply
      </Button>
    </form>
  );
}
