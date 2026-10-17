import { toast } from 'sonner';
import { findChannel } from '@/data/channels';
import { buildCsv, csvFileName } from '@/data/exportCsv';
import { sampleSpan } from '@/data/stats';
import type { Channel, Log } from '@/data/types';
import { bindLayout } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { downloadBlob } from './download';

/** What a CSV export carries: the scatter's channels in Scatter view, else the plotted ones. */
export function exportChannels(log: Log): Channel[] {
  const layout = useLayoutStore.getState();
  const found =
    layout.view === 'scatter' && layout.scatter
      ? [layout.scatter.x, layout.scatter.y, layout.scatter.color].map((h) =>
          h ? findChannel(log, h) : undefined,
        )
      : bindLayout(layout, log).flatMap((p) => p.series.map((s) => s.channel));
  const seen = new Set<string>();
  return found.filter((c): c is Channel => !!c && !seen.has(c.id) && !!seen.add(c.id));
}

/** Downloads the selection (else the visible range) as CSV; false when there is nothing to export. */
export function exportCsv(log: Log): boolean {
  const { selection, range, bounds } = useViewStore.getState();
  const r = selection ?? range ?? bounds;
  const channels = exportChannels(log);
  if (!r || channels.length === 0) return false;
  const [i0, i1] = sampleSpan(log.time, r);
  const csv = buildCsv(log, channels, i0, i1);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), csvFileName(log, r));
  return true;
}

/** Export CSV for buttons and menus: says why when nothing is plotted. */
export function exportCsvOrExplain(log: Log): void {
  if (!exportCsv(log)) toast('Plot a channel first — CSV export saves the plotted channels.');
}
