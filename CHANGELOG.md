# Changelog

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
