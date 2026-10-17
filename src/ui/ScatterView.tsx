import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChartTheme } from '@/charts/ChartPane';
import { loadPlotly, type PlotlyLike } from '@/charts/plotly';
import { defaultScatter, scatterPoints, type ScatterScope } from '@/charts/scatterData';
import { Button } from '@/components/ui/button';
import type { Log } from '@/data/types';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { ScatterControls } from './ScatterControls';

/** Dataviz sequential blue, low → high; low values recede into the theme's surface. */
const COLOR_RAMP = {
  dark: [
    [0, '#184f95'],
    [0.5, '#5598e7'],
    [1, '#cde2fb'],
  ],
  light: [
    [0, '#86b6ef'],
    [0.5, '#2a78d6'],
    [1, '#0d366b'],
  ],
} as const;

type Status = { kind: 'loading' } | { kind: 'ready'; plotly: PlotlyLike } | { kind: 'error' };

/**
 * Channel names come from files, and Plotly reads its text as pseudo-HTML (links, styling), so
 * markup is escaped. Plotly decodes these entities back to plain characters when it draws.
 */
const text = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Hover templates also expand %{…}; Plotly has no escape for it, but &#37; draws as "%". */
const hoverText = (s: string) => text(s).replace(/%/g, '&#37;');

export function ScatterView({
  log,
  onExportReady,
}: {
  log: Log;
  /** Receives a function that downloads the current plot as PNG (or null while unavailable). */
  onExportReady?: (exporter: ((fileName: string) => void) | null) => void;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [scope, setScope] = useState<ScatterScope>('view');
  const saved = useLayoutStore((s) => s.scatter);
  const range = useViewStore((s) => s.range);
  const bounds = useViewStore((s) => s.bounds);
  const selection = useViewStore((s) => s.selection);
  const theme = useChartTheme();
  const cfg = saved ?? defaultScatter(log);

  // Start from a sensible pair of channels the first time the view opens.
  useEffect(() => {
    if (!saved) {
      const initial = defaultScatter(log);
      if (initial) useLayoutStore.getState().setScatter(initial);
    }
  }, [saved, log]);

  const load = useCallback(() => {
    setStatus({ kind: 'loading' });
    loadPlotly().then(
      (plotly) => setStatus({ kind: 'ready', plotly }),
      () => setStatus({ kind: 'error' }),
    );
  }, []);
  useEffect(load, [load]);

  const effectiveScope = scope === 'selection' && !selection ? 'view' : scope;
  const points = useMemo(() => {
    if (!cfg) return { error: 'Choose an X and a Y channel' };
    const r =
      effectiveScope === 'all'
        ? null
        : effectiveScope === 'selection'
          ? selection
          : (range ?? bounds);
    return scatterPoints(log, cfg, r);
  }, [log, cfg, effectiveScope, range, bounds, selection]);

  useEffect(() => {
    const el = plotRef.current;
    if (status.kind !== 'ready' || !el || 'error' in points) return;
    const { plotly } = status;
    const { labels, c: colour } = points;
    const hover =
      `${hoverText(labels.x)}: %{x}<br>${hoverText(labels.y)}: %{y}` +
      (colour && labels.color ? `<br>${hoverText(labels.color)}: %{marker.color}` : '') +
      '<br>t: %{customdata}<extra></extra>';
    const axis = (title: string) => ({
      title: { text: text(title) },
      gridcolor: theme.grid,
      zerolinecolor: theme.border,
      linecolor: theme.border,
    });
    void plotly.react(
      el,
      [
        {
          type: 'scattergl',
          mode: 'markers',
          x: points.x,
          y: points.y,
          customdata: points.t,
          hovertemplate: hover,
          marker: {
            size: 3,
            opacity: 0.6,
            color: colour ?? theme.cursor,
            ...(colour && {
              colorscale: COLOR_RAMP[theme.mode],
              showscale: true,
              colorbar: {
                title: { text: text(labels.color ?? '') },
                outlinewidth: 0,
                thickness: 12,
              },
            }),
          },
        },
      ],
      {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: theme.font, color: theme.muted, size: 11 },
        margin: { l: 64, r: 16, t: 12, b: 48 },
        hovermode: 'closest',
        xaxis: axis(labels.x),
        yaxis: axis(labels.y),
      },
      {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['toImage', 'lasso2d', 'select2d'],
      },
    );
  }, [status, points, theme]);

  // Hand the PNG exporter to the toolbar while a plot is showing.
  useEffect(() => {
    if (!onExportReady) return;
    const el = plotRef.current;
    if (status.kind !== 'ready' || !el || 'error' in points) {
      onExportReady(null);
      return;
    }
    const { plotly } = status;
    onExportReady(
      (fileName) => void plotly.downloadImage(el, { format: 'png', filename: fileName }),
    );
    return () => onExportReady(null);
  }, [onExportReady, status, points]);

  useEffect(() => {
    const el = plotRef.current;
    return () => {
      if (el && status.kind === 'ready') status.plotly.purge(el);
    };
  }, [status]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScatterControls log={log} scope={effectiveScope} onScope={setScope} />
      <div className="relative min-h-0 flex-1">
        <div ref={plotRef} className="absolute inset-0" data-testid="scatter-plot" />
        {status.kind === 'loading' && (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Loading scatter view…
          </p>
        )}
        {status.kind === 'error' && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm"
          >
            <p>Couldn't load the scatter view. Check your connection and try again.</p>
            <Button size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        )}
        {status.kind === 'ready' && 'error' in points && (
          <p
            role="status"
            className="absolute inset-0 grid place-items-center text-sm text-muted-foreground"
          >
            {points.error}
          </p>
        )}
      </div>
      {!('error' in points) && points.shown < points.total && (
        <p className="border-t border-border px-3 py-1 text-xs text-muted-foreground">
          Showing {points.shown.toLocaleString('en-US')} of {points.total.toLocaleString('en-US')}{' '}
          points (evenly spaced).
        </p>
      )}
    </div>
  );
}
