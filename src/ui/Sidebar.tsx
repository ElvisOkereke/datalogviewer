import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { resolveSeriesColor } from '@/charts/palette';
import { Input } from '@/components/ui/input';
import { filterByQuery } from '@/data/search';
import type { Channel, Log } from '@/data/types';
import { cn } from '@/lib/utils';
import { selectedPaneId } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';

export const CHANNEL_MIME = 'application/x-dlv-channel';
const VIRTUALIZE_ABOVE = 200;
const ROW_PX = 28;

/** Whether a channel is in the selected chart, only in other charts, or nowhere. */
type RowState = { state: 'here' | 'elsewhere' | 'off'; colour: string | null };

/**
 * Toggles a channel on the selected chart (the focused pane, else the first; a pane is created
 * when there are none): removes it if that chart already shows it, otherwise adds it.
 */
export function toggleChannel(header: string): void {
  const layout = useLayoutStore.getState();
  const target =
    selectedPaneId(layout.panes, useViewStore.getState().focusedPaneId) ?? layout.addPane();
  const pane = useLayoutStore.getState().panes.find((p) => p.id === target);
  if (pane?.series.some((s) => s.header === header)) layout.removeSeries(target, header);
  else layout.addSeries(target, header);
}

export function Sidebar({
  log,
  calcErrors = {},
  onPlotted,
}: {
  log: Log;
  /** Calculated definitions this log can't evaluate, by id → reason. */
  calcErrors?: Record<string, string>;
  onPlotted?: () => void;
}) {
  const calculated = useLayoutStore((s) => s.calculated);
  const [query, setQuery] = useState('');
  const panes = useLayoutStore((s) => s.panes);
  const focusedPaneId = useViewStore((s) => s.focusedPaneId);
  const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const timeId = log.timeSource.kind === 'column' ? log.timeSource.channelId : null;
  const filtered = useMemo(() => filterByQuery(log.channels, query, (c) => c.header), [log, query]);
  const fileChannels = filtered.filter((c) => c.kind !== 'calculated');
  const calcChannels = filtered.filter((c) => c.kind === 'calculated');
  const unavailable = calculated.filter(
    (d) => calcErrors[d.id] && filterByQuery([d.name], query, (n) => n).length > 0,
  );

  const targetId = selectedPaneId(panes, focusedPaneId);
  const targetIndex = panes.findIndex((p) => p.id === targetId);
  const stateOf = (header: string): RowState => {
    const here = panes[targetIndex]?.series.find((s) => s.header === header);
    if (here) return { state: 'here', colour: resolveSeriesColor(here.color, mode) };
    for (const p of panes) {
      const s = p.series.find((x) => x.header === header);
      if (s) return { state: 'elsewhere', colour: resolveSeriesColor(s.color, mode) };
    }
    return { state: 'off', colour: null };
  };

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2 border-r border-border bg-panel p-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${log.channels.length} channels…`}
        aria-label="Search channels"
        className="h-8 text-xs"
      />
      <p className="px-1 text-[11px] text-muted-foreground" aria-live="polite">
        {panes.length ? `Chart ${targetIndex + 1} of ${panes.length}` : 'No charts yet'}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChannelList
          channels={fileChannels}
          timeId={timeId}
          stateOf={stateOf}
          onPlotted={onPlotted}
        />
        {(calcChannels.length > 0 || unavailable.length > 0) && (
          <section aria-label="Calculated channels" className="mt-2">
            <h3 className="px-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Calculated
            </h3>
            <div role="list">
              {calcChannels.map((c) => (
                <ChannelRow
                  key={c.id}
                  channel={c}
                  isTime={false}
                  row={stateOf(c.header)}
                  onPlotted={onPlotted}
                />
              ))}
              {unavailable.map((d) => (
                <div
                  key={d.id}
                  role="listitem"
                  data-testid="calc-unavailable"
                  className="flex flex-col px-1.5 py-1 text-xs opacity-60"
                >
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-[2px] bg-border" aria-hidden />
                    <span className="truncate line-through">{d.name}</span>
                    <FxTag />
                  </span>
                  <span className="pl-4.5 text-[11px] text-muted-foreground">
                    {calcErrors[d.id]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function ChannelList({
  channels,
  timeId,
  stateOf,
  onPlotted,
}: {
  channels: Channel[];
  timeId: string | null;
  stateOf(header: string): RowState;
  onPlotted?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = channels.length > VIRTUALIZE_ABOVE;
  const virtualizer = useVirtualizer({
    count: virtual ? channels.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX,
    overscan: 10,
  });
  const row = (c: Channel) => (
    <ChannelRow
      key={c.id}
      channel={c}
      isTime={c.id === timeId}
      row={stateOf(c.header)}
      onPlotted={onPlotted}
    />
  );

  return (
    <div
      ref={scrollRef}
      className={virtual ? 'max-h-[60vh] overflow-y-auto' : undefined}
      role="list"
    >
      {virtual ? (
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              className="absolute inset-x-0"
              style={{ top: item.start, height: ROW_PX }}
            >
              {row(channels[item.index])}
            </div>
          ))}
        </div>
      ) : (
        channels.map(row)
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  isTime,
  row,
  onPlotted,
}: {
  channel: Channel;
  isTime: boolean;
  row: RowState;
  onPlotted?: () => void;
}) {
  const plottable = channel.kind !== 'text';
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(CHANNEL_MIME, channel.header);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <div role="listitem">
      <button
        type="button"
        data-testid="channel-row"
        data-state={row.state}
        aria-pressed={row.state === 'here'}
        aria-disabled={!plottable}
        draggable={plottable}
        title={
          !plottable
            ? 'Text channel — shown in the table and Inspector'
            : row.state === 'elsewhere'
              ? 'Shown in another chart — click to add it to this one too'
              : undefined
        }
        onClick={() => {
          if (!plottable) return;
          toggleChannel(channel.header);
          onPlotted?.();
        }}
        onDragStart={plottable ? onDragStart : undefined}
        className={cn(
          'flex h-7 w-full items-center gap-2 rounded-sm px-1.5 text-left text-xs',
          plottable ? 'hover:bg-accent' : 'cursor-default opacity-50',
          row.state === 'here' && 'bg-accent/70 font-medium',
        )}
      >
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-[2px]',
            row.state === 'off' && 'bg-border',
            row.state === 'elsewhere' && 'border-[1.5px] bg-transparent',
          )}
          style={
            row.state === 'here'
              ? { background: row.colour ?? undefined }
              : row.state === 'elsewhere'
                ? { borderColor: row.colour ?? undefined }
                : undefined
          }
          aria-hidden
        />
        <span className="truncate">{channel.name}</span>
        {channel.kind === 'calculated' && <FxTag />}
        {isTime && (
          <span className="rounded-sm bg-muted px-1 text-[10px] text-muted-foreground uppercase">
            time
          </span>
        )}
        {channel.unit && (
          <span className="num ml-auto shrink-0 text-[11px] text-muted-foreground">
            {channel.unit}
          </span>
        )}
      </button>
    </div>
  );
}

function FxTag() {
  return (
    <span
      className="num rounded-sm bg-primary/15 px-1 text-[10px] text-primary italic"
      aria-label="calculated"
    >
      fx
    </span>
  );
}
