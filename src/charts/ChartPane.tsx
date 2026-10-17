import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { cn } from '@/lib/utils';
import type { Log } from '@/data/types';
import type { BoundPane } from '@/state/layout';
import { useViewStore } from '@/state/viewStore';
import { buildPaneOptions } from './buildOptions';
import { readChartTheme, type ChartTheme } from './chartTheme';
import { Legend } from './Legend';
import { navigationPlugin } from './navigation';
import type { XRange } from './range';

const navigation = () => {
  const view = useViewStore.getState;
  return navigationPlugin({
    zoomAt: (anchor, factor) => view().zoomAt(anchor, factor),
    pan: (delta) => view().pan(delta),
    setRange: (r) => view().setRange(r),
    fit: () => view().fit(),
    pin: (i) => view().pin(i),
    isPinned: () => view().pinned,
  });
};

/** Exposes the visible x-range on the pane for tests and debugging (uPlot draws axes on canvas). */
function markRange(el: HTMLElement | null, r: XRange) {
  if (!el) return;
  el.dataset.xMin = String(r.min);
  el.dataset.xMax = String(r.max);
}

/** Re-reads chart colours whenever the app theme (data-theme on <html>) changes. */
function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(readChartTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readChartTheme()));
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/** Hover rebuilds the chart, so a quick pass over the legend shouldn't. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function ChartPane({ pane, log, focused }: { pane: BoundPane; log: Log; focused: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const uRef = useRef<uPlot | null>(null);
  const paneRef = useRef(pane);
  paneRef.current = pane;
  const theme = useChartTheme();
  const [stickyAxis, setStickyAxis] = useState<string | null>(null);
  const [hoverAxis, setHoverAxis] = useState<string | null>(null);
  const axisHeader = useDebounced(hoverAxis, 150) ?? stickyAxis;

  // Rebuild only when what is drawn changes, not on every re-render of a fresh BoundPane object.
  const signature = useMemo(
    () =>
      JSON.stringify({
        shared: pane.sharedAxis,
        series: pane.series.map(({ header, color, scale, channel }) => ({
          header,
          color,
          scale,
          bound: channel !== null,
        })),
      }),
    [pane],
  );

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const { opts, data } = buildPaneOptions({
      pane: paneRef.current,
      log,
      theme,
      width: Math.max(width, 100),
      height: Math.max(height, 60),
      axisHeader,
    });
    opts.plugins = [navigation()];
    opts.hooks = {
      setCursor: [(u) => useViewStore.getState().setCursor(u.cursor.idx ?? null)],
    };

    const u = new uPlot(opts, data, el);
    uRef.current = u;
    const { range, bounds } = useViewStore.getState();
    const r = range ?? bounds;
    if (r) {
      u.setScale('x', r);
      markRange(rootRef.current, r);
    }

    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      if (box.width > 0 && box.height > 0) u.setSize({ width: box.width, height: box.height });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      u.destroy();
      uRef.current = null;
    };
  }, [signature, log, theme, axisHeader]);

  // Follow the shared x-range and pinned cursor.
  useEffect(
    () =>
      useViewStore.subscribe((s, prev) => {
        const u = uRef.current;
        if (!u) return;
        const r = s.range ?? s.bounds;
        if (r && (s.range !== prev.range || s.bounds !== prev.bounds)) {
          if (u.scales.x.min !== r.min || u.scales.x.max !== r.max) u.setScale('x', r);
          markRange(rootRef.current, r);
        }
        if (s.pinned && s.cursor != null && (s.cursor !== prev.cursor || !prev.pinned)) {
          const left = u.valToPos(log.time[s.cursor], 'x');
          if (u.cursor.idx !== s.cursor) u.setCursor({ left, top: u.cursor.top ?? 0 });
        }
      }),
    [log],
  );

  return (
    <div
      ref={rootRef}
      data-testid="chart-pane"
      data-pane-id={pane.id}
      className={cn(
        'flex h-full min-h-0 flex-col border-l-2 bg-background',
        focused ? 'border-primary' : 'border-transparent',
      )}
      onPointerDown={() => useViewStore.getState().focusPane(pane.id)}
    >
      <Legend
        pane={pane}
        log={log}
        onHoverSeries={setHoverAxis}
        onUseForAxis={(header) => setStickyAxis(header)}
      />
      <div className="relative min-h-0 flex-1">
        {/* Absolutely positioned so the canvas never feeds back into its own measured size. */}
        <div ref={plotRef} className="absolute inset-0 overflow-hidden" />
      </div>
    </div>
  );
}
