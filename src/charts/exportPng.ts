import { downloadBlob } from '@/ui/download';
import { readChartTheme } from './chartTheme';

/** Stacks panes (device pixels) top to bottom, each under a legend row; offsets are legend tops. */
export function pngLayout(
  panes: { width: number; height: number }[],
  legendHeight: number,
  gap: number,
): { width: number; height: number; offsets: number[] } {
  const offsets: number[] = [];
  let y = 0;
  for (const p of panes) {
    offsets.push(y);
    y += legendHeight + p.height + gap;
  }
  return {
    width: Math.max(0, ...panes.map((p) => p.width)),
    height: panes.length ? y - gap : 0,
    offsets,
  };
}

interface LegendItem {
  color: string;
  text: string;
}

/** The legend as shown: swatch colour plus name, unit and the value at the cursor. */
function legendItems(pane: Element): LegendItem[] {
  return [...pane.querySelectorAll('[data-legend-entry]')].map((entry) => {
    const swatch = entry.querySelector<HTMLElement>('[data-swatch]');
    const parts = [...entry.children].filter((c) => c !== swatch).map((c) => c.textContent ?? '');
    return {
      color: swatch ? getComputedStyle(swatch).backgroundColor : 'transparent',
      text: parts.filter(Boolean).join(' '),
    };
  });
}

const LEGEND_CSS_PX = 22;
const GAP_CSS_PX = 8;

/** Composes every chart pane under `root` (legend + plot canvas) into one PNG and downloads it. */
export async function exportChartsPng(
  root: HTMLElement,
  background: string,
  fileName: string,
): Promise<void> {
  const panes = [...root.querySelectorAll('[data-testid="chart-pane"]')]
    .map((el) => ({ el, canvas: el.querySelector<HTMLCanvasElement>('.uplot canvas') }))
    .filter((p): p is { el: Element; canvas: HTMLCanvasElement } => !!p.canvas?.width);
  if (panes.length === 0) return;

  // uPlot sizes its canvas at device pixel ratio; match it so text is as sharp as the plot.
  const dpr = panes[0].canvas.width / (panes[0].canvas.clientWidth || panes[0].canvas.width);
  const legendHeight = Math.round(LEGEND_CSS_PX * dpr);
  const layout = pngLayout(
    panes.map((p) => ({ width: p.canvas.width, height: p.canvas.height })),
    legendHeight,
    Math.round(GAP_CSS_PX * dpr),
  );

  const out = document.createElement('canvas');
  out.width = layout.width;
  out.height = layout.height;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);

  const theme = readChartTheme();
  const fontPx = 11 * dpr;
  ctx.font = `${fontPx}px ${theme.font}`;
  ctx.textBaseline = 'middle';
  panes.forEach(({ el, canvas }, i) => {
    const top = layout.offsets[i];
    let x = 8 * dpr;
    const mid = top + legendHeight / 2;
    for (const item of legendItems(el)) {
      const size = 10 * dpr;
      ctx.fillStyle = item.color;
      ctx.fillRect(x, mid - size / 2, size, size);
      x += size + 6 * dpr;
      ctx.fillStyle = theme.text;
      ctx.fillText(item.text, x, mid);
      x += ctx.measureText(item.text).width + 14 * dpr;
    }
    ctx.drawImage(canvas, 0, top + legendHeight);
  });

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (blob) downloadBlob(blob, fileName);
}
