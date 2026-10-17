import type uPlot from 'uplot';
import type { XRange } from './range';

/** The pixel band of a selection, clipped to the plot; null when it is entirely outside. */
export function bandRect(
  sel: XRange,
  toPx: (v: number) => number,
  plotLeft: number,
  plotWidth: number,
): { left: number; width: number } | null {
  const left = Math.max(toPx(sel.min), plotLeft);
  const right = Math.min(toPx(sel.max), plotLeft + plotWidth);
  return right > left ? { left, width: right - left } : null;
}

export interface OverlayMarker {
  t: number;
  label: string;
}

/**
 * Draws the range selection (a translucent band) and markers (dashed lines, optionally labelled)
 * on top of a chart. Called from uPlot's `draw` hook, in canvas pixels.
 */
export function drawOverlays(
  u: uPlot,
  sel: XRange | null,
  markers: OverlayMarker[],
  opts: { accent: string; drawLabels: boolean; font: string },
): void {
  const { ctx, bbox } = u;
  const toPx = (v: number) => u.valToPos(v, 'x', true);
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  if (sel) {
    const band = bandRect(sel, toPx, bbox.left, bbox.width);
    if (band) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = opts.accent;
      ctx.fillRect(band.left, bbox.top, band.width, bbox.height);
      ctx.globalAlpha = 0.6;
      ctx.fillRect(band.left, bbox.top, 1 * dpr, bbox.height);
      ctx.fillRect(band.left + band.width - dpr, bbox.top, 1 * dpr, bbox.height);
    }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = opts.accent;
  ctx.fillStyle = opts.accent;
  ctx.lineWidth = dpr;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.font = `${11 * dpr}px ${opts.font}`;
  ctx.textBaseline = 'top';
  for (const m of markers) {
    const x = Math.round(toPx(m.t)) + 0.5;
    if (x < bbox.left || x > bbox.left + bbox.width) continue;
    ctx.beginPath();
    ctx.moveTo(x, bbox.top);
    ctx.lineTo(x, bbox.top + bbox.height);
    ctx.stroke();
    if (opts.drawLabels) ctx.fillText(m.label, x + 4 * dpr, bbox.top + 2 * dpr);
  }
  ctx.restore();
}
