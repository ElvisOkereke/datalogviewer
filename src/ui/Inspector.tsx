import { useMemo, useState } from 'react';
import { formatTime, formatValue } from '@/charts/buildOptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { filterByQuery } from '@/data/search';
import { rangeStats, sampleSpan } from '@/data/stats';
import type { Channel, Log } from '@/data/types';
import type { InspectorTab } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { MarkersTab } from './MarkersTab';

const valueAt = (ch: Channel, i: number | null) => {
  if (i == null) return '—';
  if (ch.text) return ch.text[i] ?? '';
  return formatValue(ch.values?.[i]);
};

/** Cursor values, range statistics and markers for the active log, in tabs. */
export function Inspector({ log }: { log: Log }) {
  const tab = useLayoutStore((s) => s.inspectorTab);
  const [query, setQuery] = useState('');
  const channels = useMemo(() => filterByQuery(log.channels, query, (c) => c.header), [log, query]);

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2 border-l border-border bg-panel p-2 text-xs">
      <Tabs
        value={tab}
        onValueChange={(v) => useLayoutStore.getState().setInspectorTab(v as InspectorTab)}
        className="flex min-h-0 flex-1 flex-col gap-2"
      >
        <TabsList className="w-full">
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
          <TabsTrigger value="range">Range</TabsTrigger>
          <TabsTrigger value="markers">Markers</TabsTrigger>
        </TabsList>
        {tab !== 'markers' && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search Inspector"
            className="h-8 text-xs"
          />
        )}
        <TabsContent value="cursor" className="flex min-h-0 flex-1 flex-col gap-2">
          <CursorTab log={log} channels={channels} />
        </TabsContent>
        <TabsContent value="range" className="flex min-h-0 flex-1 flex-col gap-2">
          <RangeTab log={log} channels={channels} />
        </TabsContent>
        <TabsContent value="markers" className="flex min-h-0 flex-1 flex-col gap-2">
          <MarkersTab log={log} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function CursorTab({ log, channels }: { log: Log; channels: Channel[] }) {
  const raw = useViewStore((s) => s.cursor);
  const cursor = raw != null && raw < log.rowCount ? raw : null;
  return (
    <>
      <div className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {cursor == null
          ? 'Hover a chart'
          : `At cursor · ${formatTime(log.time[cursor], log.timeSource)}`}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {channels.map((ch) => (
          <div
            key={ch.id}
            data-testid="inspector-row"
            className="flex items-baseline gap-2 border-b border-border/60 px-1 py-1"
          >
            <span className="truncate text-muted-foreground">{ch.name}</span>
            <span className="num ml-auto shrink-0 text-foreground">{valueAt(ch, cursor)}</span>
            <span className="w-10 shrink-0 truncate text-[11px] text-muted-foreground/70">
              {ch.unit ?? ''}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function RangeTab({ log, channels }: { log: Log; channels: Channel[] }) {
  const selection = useViewStore((s) => s.selection);
  const span = useMemo(
    () => (selection ? sampleSpan(log.time, selection) : null),
    [log, selection],
  );
  const stats = useMemo(() => {
    if (!span) return new Map<string, ReturnType<typeof rangeStats>>();
    return new Map(
      log.channels
        .filter((c) => c.values)
        .map((c) => [c.id, rangeStats(c.values!, span[0], span[1])]),
    );
  }, [log, span]);

  if (!selection || !span) {
    return (
      <p className="px-1 text-muted-foreground">
        Select a range with Shift+drag on a chart to see its statistics.
      </p>
    );
  }
  const samples = span[1] - span[0];
  return (
    <>
      <div className="flex flex-col gap-0.5 px-1">
        <span className="num text-foreground">
          {formatTime(selection.min, log.timeSource)} – {formatTime(selection.max, log.timeSource)}
        </span>
        <span className="text-muted-foreground">
          {log.timeSource.kind === 'column' &&
            `${formatTime(selection.max - selection.min, log.timeSource)} · `}
          {samples.toLocaleString('en-US')} samples
        </span>
      </div>
      <div className="flex gap-2 px-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => useViewStore.getState().zoomToSelection()}
        >
          Zoom to selection
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => useViewStore.getState().clearSelection()}
        >
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_repeat(4,auto)] gap-x-2 px-1 text-[10px] text-muted-foreground uppercase">
        <span>Channel</span>
        <span className="text-right">Min</span>
        <span className="text-right">Mean</span>
        <span className="text-right">Max</span>
        <span className="text-right">Std</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {channels
          .filter((c) => c.values)
          .map((ch) => {
            const s = stats.get(ch.id);
            return (
              <div
                key={ch.id}
                data-testid="range-row"
                className="grid grid-cols-[1fr_repeat(4,auto)] items-baseline gap-x-2 border-b border-border/60 px-1 py-1"
              >
                <span className="truncate text-muted-foreground" title={ch.header}>
                  {ch.name}
                </span>
                <span className="num text-right">{formatValue(s?.min)}</span>
                <span className="num text-right text-foreground">{formatValue(s?.mean)}</span>
                <span className="num text-right">{formatValue(s?.max)}</span>
                <span className="num text-right">{formatValue(s?.std)}</span>
              </div>
            );
          })}
      </div>
    </>
  );
}
