import type uPlot from 'uplot';
import type { XRange } from './range';

export interface NavigationHandlers {
  zoomAt(anchor: number, factor: number): void;
  pan(delta: number): void;
  setRange(r: XRange): void;
  /** Shift+drag picks a range (for statistics) rather than zooming. */
  select(r: XRange): void;
  fit(): void;
  /** Pins the cursor at an x value (the caller maps it to a log row). */
  pinAt(x: number): void;
  /** While pinned the crosshair ignores hover, except during a Shift+drag selection. */
  isPinned(): boolean;
}

/** Wheel deltas in lines/pages are converted to pixels; one mouse notch is about 100 px. */
const DELTA_MODE_PX = [1, 33, 100];
const WHEEL_ZOOM_PER_PX = 0.0022;

/**
 * Zoom factor for a wheel event: proportional to the scroll distance (gentle for trackpads,
 * about 25% per mouse notch), clamped, and null for purely horizontal scrolling.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number | null {
  if (!deltaY) return null;
  const px = deltaY * (DELTA_MODE_PX[deltaMode] ?? 1);
  return Math.exp(Math.min(Math.max(px, -100), 100) * WHEEL_ZOOM_PER_PX);
}

/** Pointer travel below this is a click (pin the cursor), above it a drag (pan). */
const CLICK_SLOP_PX = 4;

/**
 * Mouse and touch navigation for a chart pane:
 * wheel = zoom at the pointer, drag = pan, Shift+drag = select a range (uPlot's own selection),
 * double-click = fit, click/tap = pin the cursor, two-finger pinch = zoom.
 */
export function navigationPlugin(h: NavigationHandlers): uPlot.Plugin {
  let selecting = false;

  return {
    opts: (_u, opts) => {
      const bind = opts.cursor?.bind ?? {};
      opts.cursor = {
        ...opts.cursor,
        bind: {
          ...bind,
          mousemove: (_self, _targ, handler) => (e) => {
            if (selecting || !h.isPinned()) handler(e);
            return null;
          },
          mouseleave: (_self, _targ, handler) => (e) => {
            if (!h.isPinned()) handler(e);
            return null;
          },
          // Only Shift+drag reaches uPlot's selection; plain drags are ours (pan).
          mousedown: (_self, _targ, handler) => (e) => {
            selecting = e.shiftKey && e.button === 0;
            if (selecting) handler(e);
            return null;
          },
          mouseup: (_self, _targ, handler) => (e) => {
            if (selecting) handler(e);
            selecting = false;
            return null;
          },
        },
      };
    },
    hooks: {
      init: [
        (u) => {
          const over = u.over;
          over.style.touchAction = 'none';
          const pxToVal = (dxPx: number) => {
            const { min, max } = u.scales.x;
            return min == null || max == null ? 0 : (dxPx * (max - min)) / over.clientWidth;
          };

          over.addEventListener(
            'wheel',
            (e) => {
              const factor = wheelZoomFactor(e.deltaY, e.deltaMode);
              if (factor === null) return;
              e.preventDefault();
              h.zoomAt(u.posToVal(e.offsetX, 'x'), factor);
            },
            { passive: false },
          );
          over.addEventListener('dblclick', () => h.fit());

          const pointers = new Map<number, { x: number; startX: number }>();
          let moved = false;
          let pinchDistance = 0;

          over.addEventListener('pointerdown', (e) => {
            if (e.shiftKey || e.button !== 0) return;
            over.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, startX: e.clientX });
            moved = false;
            if (pointers.size === 2) {
              const [a, b] = [...pointers.values()];
              pinchDistance = Math.abs(a.x - b.x);
            }
          });

          over.addEventListener('pointermove', (e) => {
            const p = pointers.get(e.pointerId);
            if (!p) return;
            if (pointers.size === 2) {
              p.x = e.clientX;
              const [a, b] = [...pointers.values()];
              const distance = Math.abs(a.x - b.x);
              if (pinchDistance > 0 && distance > 0) {
                const rect = over.getBoundingClientRect();
                const mid = u.posToVal((a.x + b.x) / 2 - rect.left, 'x');
                h.zoomAt(mid, pinchDistance / distance);
              }
              pinchDistance = distance;
              moved = true;
              return;
            }
            const dx = e.clientX - p.x;
            p.x = e.clientX;
            if (Math.abs(e.clientX - p.startX) >= CLICK_SLOP_PX) moved = true;
            if (moved && dx !== 0) h.pan(-pxToVal(dx));
          });

          const end = (e: PointerEvent) => {
            if (!pointers.has(e.pointerId)) return;
            const wasSingle = pointers.size === 1;
            pointers.delete(e.pointerId);
            if (wasSingle && !moved && e.type === 'pointerup') {
              const rect = over.getBoundingClientRect();
              h.pinAt(u.posToVal(e.clientX - rect.left, 'x'));
            }
          };
          over.addEventListener('pointerup', end);
          over.addEventListener('pointercancel', end);
        },
      ],
      setSelect: [
        (u) => {
          if (u.select.width <= 0) return;
          const min = u.posToVal(u.select.left, 'x');
          const max = u.posToVal(u.select.left + u.select.width, 'x');
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
          // Apply after uPlot finishes its mouseup: changing the range re-places a pinned cursor,
          // and doing that mid-drag would re-enter uPlot's selection.
          if (max > min) queueMicrotask(() => h.select({ min, max }));
        },
      ],
    },
  };
}
