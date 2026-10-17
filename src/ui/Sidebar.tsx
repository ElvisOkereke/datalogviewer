import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { resolveSeriesColor } from '@/charts/palette';
import { Input } from '@/components/ui/input';
import { filterByQuery } from '@/data/search';
import type { Channel, Log } from '@/data/types';
import { cn } from '@/lib/utils';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';

export const CHANNEL_MIME = 'application/x-dlv-channel';
const VIRTUALIZE_ABOVE = 200;
const ROW_PX = 28;

/** Plots a channel in the focused pane (or the first pane, creating one if needed). */
export function plotChannel(header: string): void {
  const layout = useLayoutStore.getState();
  const focused = useViewStore.getState().focusedPaneId;
  const target =
    layout.panes.find((p) => p.id === focused)?.id ?? layout.panes[0]?.id ?? layout.addPane();
  layout.addSeries(target, header);
}

export function Sidebar({ log, onPlotted }: { log: Log; onPlotted?: () => void }) {
  const [query, setQuery] = useState('');
  const panes = useLayoutStore((s) => s.panes);
  const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const timeId = log.timeSource.kind === 'column' ? log.timeSource.channelId : null;
  const channels = useMemo(() => filterByQuery(log.channels, query, (c) => c.header), [log, query]);
  const colourOf = (header: string) => {
    for (const p of panes) {
      const s = p.series.find((x) => x.header === header);
      if (s) return resolveSeriesColor(s.color, mode);
    }
    return null;
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
      <ChannelList channels={channels} timeId={timeId} colourOf={colourOf} onPlotted={onPlotted} />
    </aside>
  );
}

function ChannelList({
  channels,
  timeId,
  colourOf,
  onPlotted,
}: {
  channels: Channel[];
  timeId: string | null;
  colourOf(header: string): string | null;
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
      colour={colourOf(c.header)}
      onPlotted={onPlotted}
    />
  );

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" role="list">
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
  colour,
  onPlotted,
}: {
  channel: Channel;
  isTime: boolean;
  colour: string | null;
  onPlotted?: () => void;
}) {
  const plottable = channel.kind === 'numeric';
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(CHANNEL_MIME, channel.header);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <button
      type="button"
      role="listitem"
      data-testid="channel-row"
      aria-disabled={!plottable}
      draggable={plottable}
      title={plottable ? undefined : 'Text channel — shown in the table and Inspector'}
      onClick={() => {
        if (!plottable) return;
        plotChannel(channel.header);
        onPlotted?.();
      }}
      onDragStart={plottable ? onDragStart : undefined}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded-sm px-1.5 text-left text-xs',
        plottable ? 'hover:bg-accent' : 'cursor-default opacity-50',
        colour && 'bg-accent/60',
      )}
    >
      <span
        className="size-2.5 shrink-0 rounded-[2px] bg-border"
        style={colour ? { background: colour } : undefined}
        aria-hidden
      />
      <span className="truncate">{channel.name}</span>
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
  );
}
