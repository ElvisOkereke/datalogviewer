import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef } from 'react';
import { formatTime, formatValue } from '@/charts/buildOptions';
import type { Channel, Log } from '@/data/types';
import { cn } from '@/lib/utils';
import { useViewStore } from '@/state/viewStore';

const ROW_PX = 28;
const TIME_COL_PX = 110;
const COL_PX = 120;

const cell = (ch: Channel, i: number) =>
  ch.text ? (ch.text[i] ?? '') : formatValue(ch.values?.[i]);

/** Virtualized raw-data view; the cursor row is highlighted and clicking a row pins it. */
export function DataTable({ log }: { log: Log }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursor = useViewStore((s) => s.cursor);
  const timeId = log.timeSource.kind === 'column' ? log.timeSource.channelId : null;
  const columns = useMemo(() => log.channels.filter((c) => c.id !== timeId), [log, timeId]);
  const width = TIME_COL_PX + columns.length * COL_PX;

  const virtualizer = useVirtualizer({
    count: log.rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX,
    overscan: 20,
  });

  // Keep the cursor row in view when it moves elsewhere (charts, keyboard).
  useEffect(() => {
    if (cursor != null) virtualizer.scrollToIndex(cursor, { align: 'auto' });
  }, [cursor, virtualizer]);

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-rowcount={log.rowCount + 1}
      className="h-full min-h-0 overflow-auto bg-background text-xs"
    >
      <div
        role="row"
        className="sticky top-0 z-10 flex border-b border-border bg-panel"
        style={{ width }}
      >
        <div
          role="columnheader"
          className="shrink-0 px-2 py-1.5 font-medium"
          style={{ width: TIME_COL_PX }}
        >
          {log.timeSource.kind === 'index' ? 'Row' : 'Time'}
        </div>
        {columns.map((ch) => (
          <div
            key={ch.id}
            role="columnheader"
            className="shrink-0 truncate px-2 py-1.5 font-medium"
            style={{ width: COL_PX }}
            title={ch.header}
          >
            {ch.name}
            {ch.unit && (
              <span className="block text-[10px] font-normal text-muted-foreground">{ch.unit}</span>
            )}
          </div>
        ))}
      </div>
      <div className="relative" style={{ height: virtualizer.getTotalSize(), width }}>
        {virtualizer.getVirtualItems().map((item) => {
          const i = item.index;
          const selected = i === cursor;
          return (
            <div
              key={item.key}
              role="row"
              data-index={i}
              aria-selected={selected}
              onClick={() => useViewStore.getState().pin(i)}
              className={cn(
                'absolute inset-x-0 flex cursor-pointer border-b border-border/40 hover:bg-accent',
                selected && 'bg-primary/15 hover:bg-primary/20',
              )}
              style={{ top: item.start, height: ROW_PX }}
            >
              <div
                role="cell"
                className="num shrink-0 px-2 leading-7 text-muted-foreground"
                style={{ width: TIME_COL_PX }}
              >
                {formatTime(log.time[i], log.timeSource)}
              </div>
              {columns.map((ch) => (
                <div
                  key={ch.id}
                  role="cell"
                  className={cn('shrink-0 truncate px-2 leading-7', ch.values && 'num text-right')}
                  style={{ width: COL_PX }}
                >
                  {cell(ch, i)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
