import { useMemo, useState } from 'react';
import { formatTime, formatValue } from '@/charts/buildOptions';
import { Input } from '@/components/ui/input';
import { filterByQuery } from '@/data/search';
import type { Channel, Log } from '@/data/types';
import { useViewStore } from '@/state/viewStore';

const valueAt = (ch: Channel, i: number | null) => {
  if (i == null) return '—';
  if (ch.text) return ch.text[i] ?? '';
  return formatValue(ch.values?.[i]);
};

/** Every channel's value at the cursor — not just the plotted ones. */
export function Inspector({ log }: { log: Log }) {
  const raw = useViewStore((s) => s.cursor);
  const cursor = raw != null && raw < log.rowCount ? raw : null;
  const [query, setQuery] = useState('');
  const channels = useMemo(() => filterByQuery(log.channels, query, (c) => c.header), [log, query]);

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2 border-l border-border bg-panel p-2 text-xs">
      <div className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {cursor == null
          ? 'Hover a chart'
          : `At cursor · ${formatTime(log.time[cursor], log.timeSource)}`}
      </div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        aria-label="Search Inspector"
        className="h-8 text-xs"
      />
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
    </aside>
  );
}
