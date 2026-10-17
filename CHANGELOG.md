# Changelog

## [Unreleased]

## [0.2.0] - 2026-10-17

The Tier 2 Analyst release.

- Calculated channels: formulas over channels with arithmetic, comparisons, logic and functions (abs, min, max, clamp, if, round, sqrt, delta, rate, smooth, lag); live validation with error positions.
- Range selection: Shift+drag selects a range (Z zooms to it, Esc clears) with min/mean/max/std per channel in a new Range tab.
- Markers: M drops a marker at the cursor; listed in a Markers tab, saved per log.
- Layout files: save and open layouts (charts, calculated channels) as .dlvlayout.json.
- Layout schema v2 (older saved layouts are upgraded automatically), with size limits.
- Scatter view: any two channels, optionally coloured by a third, over the view, the selection or the whole log; up to 200,000 points (evenly sampled beyond that). Plotly loads only when the view is first opened.
- Export CSV: the plotted channels over the selection (else the view), with spreadsheet formula-injection protection.
- Export PNG: the charts with their legends, or the scatter plot.
- Saved markers store a digest rather than file names; only the 100 most recently marked logs are kept.

## [0.1.0] - 2026-10-17

First public release: the Tier 1 Workbench.

- Stacked uPlot charts with a shared crosshair, per-channel scales and live legends.
- Wheel zoom, drag pan, Shift+drag box zoom, double-click fit, pinned cursor with keyboard stepping.
- Overview strip with a draggable, resizable window.
- Min/max decimation keeps 1M-row logs at 60 fps without hiding spikes.
- Searchable channel sidebar with click and drag-to-plot; resizable chart panes with add and delete.
- Inspector panel and a virtualized table view synced to the cursor.
- Layout saved in the browser and re-bound to channels by name across logs.
- Toolbar, empty state, progress and error feedback, warning summaries, keyboard shortcuts, About.
- Dark and light Instrument themes; drawers and touch gestures on phones.
- CSV reader: delimiter, decimal-comma, preamble, header, units-row and time-column detection; trailing delimiters; unbalanced quotes; placeholders; explicit date-time parsing; windows-1252 fallback; parsing in a Web Worker.
- Rebuilt as a browser app (TypeScript, React, Vite) deployed to GitHub Pages.
