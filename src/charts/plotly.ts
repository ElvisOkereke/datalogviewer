/** The slice of Plotly's API the scatter view uses. */
export interface PlotlyLike {
  react(el: HTMLElement, data: unknown[], layout: unknown, config?: unknown): Promise<unknown>;
  purge(el: HTMLElement): void;
  downloadImage(
    el: HTMLElement,
    opts: { format: 'png'; filename: string; width?: number; height?: number },
  ): Promise<unknown>;
}

let loading: Promise<PlotlyLike> | null = null;

/**
 * Loads Plotly on first use (a separate ~1.5 MB chunk), once. A failed load is forgotten so the
 * user can retry.
 */
export function loadPlotly(): Promise<PlotlyLike> {
  loading ??= import('plotly.js-gl2d-dist-min')
    .then((m) => ((m as { default?: unknown }).default ?? m) as PlotlyLike)
    .catch((err: unknown) => {
      loading = null;
      throw err;
    });
  return loading;
}
