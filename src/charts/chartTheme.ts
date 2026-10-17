export interface ChartTheme {
  mode: 'dark' | 'light';
  text: string;
  muted: string;
  grid: string;
  border: string;
  cursor: string;
  font: string;
  monoFont: string;
}

/** Chart colours come from the same CSS variables as the rest of the UI (src/index.css). */
export function readChartTheme(): ChartTheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    mode: root.dataset.theme === 'light' ? 'light' : 'dark',
    text: v('--foreground'),
    muted: v('--muted-foreground'),
    grid: v('--muted'),
    border: v('--border'),
    cursor: v('--primary'),
    font: 'Inter Variable, ui-sans-serif, system-ui, sans-serif',
    monoFont: 'JetBrains Mono Variable, ui-monospace, monospace',
  };
}
