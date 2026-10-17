import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Channel, Log } from '@/data/types';
import { useViewStore } from '@/state/viewStore';
import { seriesRange, toPlotValues } from './buildOptions';
import { readChartTheme } from './chartTheme';
import { panRange, resizeRange, type XRange } from './range';

const HEIGHT = 32;
const EDGE_PX = 6;

type Drag =
  | { kind: 'move'; startX: number; start: XRange }
  | { kind: 'edge'; edge: 'min' | 'max'; start: XRange };

/** The whole log in miniature, with the visible range as a draggable, resizable window. */
export function OverviewStrip({ log, channel }: { log: Log; channel: Channel | null }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const uRef = useRef<uPlot | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [win, setWin] = useState<{ left: number; width: number; offset: number } | null>(null);
  // Bumped whenever the strip is (re)built or resized, so the window is re-measured.
  const [layoutTick, setLayoutTick] = useState(0);
  const range = useViewStore((s) => s.range);
  const bounds = useViewStore((s) => s.bounds);

  useEffect(() => {
    const el = plotRef.current;
    if (!el || !channel?.values) return;
    const theme = readChartTheme();
    const u = new uPlot(
      {
        width: Math.max(el.clientWidth, 100),
        height: HEIGHT,
        legend: { show: false },
        cursor: { show: false, drag: { x: false, y: false } },
        scales: { x: { time: false }, y: { range: seriesRange(channel) } },
        axes: [{ show: false }, { show: false }],
        series: [{}, { stroke: theme.muted, width: 1, points: { show: false } }],
      },
      [log.time, toPlotValues(channel.values)] as uPlot.AlignedData,
      el,
    );
    uRef.current = u;
    setLayoutTick((t) => t + 1);
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        u.setSize({ width: entry.contentRect.width, height: HEIGHT });
      setLayoutTick((t) => t + 1);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      u.destroy();
      uRef.current = null;
    };
  }, [log, channel]);

  // Position the window over the visible range.
  useEffect(() => {
    const u = uRef.current;
    const r = range ?? bounds;
    if (!u || !r) return;
    const left = u.valToPos(r.min, 'x');
    const right = u.valToPos(r.max, 'x');
    setWin({ left, width: Math.max(right - left, 4), offset: u.over.offsetLeft });
  }, [range, bounds, layoutTick]);

  const valueAt = (clientX: number) => {
    const u = uRef.current!;
    return u.posToVal(clientX - u.over.getBoundingClientRect().left, 'x');
  };

  const onWindowDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = useViewStore.getState().range ?? useViewStore.getState().bounds;
    if (!r) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left <= EDGE_PX) dragRef.current = { kind: 'edge', edge: 'min', start: r };
    else if (rect.right - e.clientX <= EDGE_PX)
      dragRef.current = { kind: 'edge', edge: 'max', start: r };
    else dragRef.current = { kind: 'move', startX: e.clientX, start: r };
  };

  const onWindowMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const { bounds: b, minSpan, setRange } = useViewStore.getState();
    if (!drag || !b) return;
    if (drag.kind === 'move') {
      const delta = valueAt(e.clientX) - valueAt(drag.startX);
      setRange(panRange(drag.start, delta, b));
    } else {
      setRange(resizeRange(drag.start, drag.edge, valueAt(e.clientX), b, minSpan));
    }
  };

  const onStripDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { range: r, bounds: b, setRange } = useViewStore.getState();
    const current = r ?? b;
    if (!current || !uRef.current) return;
    const centre = valueAt(e.clientX);
    const half = (current.max - current.min) / 2;
    setRange({ min: centre - half, max: centre + half });
  };

  if (!channel?.values) return null;
  return (
    <div
      data-testid="overview"
      className="relative shrink-0 border-t border-border bg-panel"
      style={{ height: HEIGHT }}
      onPointerDown={onStripDown}
    >
      <div ref={plotRef} className="absolute inset-0 overflow-hidden" />
      {win && (
        <div
          data-testid="overview-window"
          className="absolute inset-y-0.5 cursor-grab rounded-sm border border-primary bg-primary/15 active:cursor-grabbing"
          style={{ left: win.offset + win.left, width: win.width }}
          onPointerDown={onWindowDown}
          onPointerMove={onWindowMove}
          onPointerUp={() => (dragRef.current = null)}
        >
          <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" aria-hidden />
          <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" aria-hidden />
        </div>
      )}
    </div>
  );
}
