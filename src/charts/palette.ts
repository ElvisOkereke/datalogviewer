/** A palette slot id ('s1'…'s8', resolved per theme) or a custom '#rrggbb'. */
export type SeriesColor = string;

/**
 * Categorical series colours, validated with the dataviz skill's validator against the Instrument
 * surfaces (#0e1013 dark, #f7f8fa light). Light s3–s5 sit below 3:1, so values are always shown as
 * text beside the swatch.
 */
export const SERIES_SLOTS: Record<'dark' | 'light', string[]> = {
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
};

const SLOT = /^s([1-8])$/;

export function resolveSeriesColor(color: SeriesColor, theme: 'dark' | 'light'): string {
  if (color.startsWith('#')) return color;
  const m = SLOT.exec(color);
  return SERIES_SLOTS[theme][m ? Number(m[1]) - 1 : 0];
}

/** The lowest slot not already used; once all eight are taken, slots repeat in order. */
export function nextSeriesColor(used: SeriesColor[]): SeriesColor {
  for (let i = 1; i <= 8; i++) if (!used.includes(`s${i}`)) return `s${i}`;
  const slotsUsed = used.filter((c) => SLOT.test(c)).length;
  return `s${(slotsUsed % 8) + 1}`;
}
