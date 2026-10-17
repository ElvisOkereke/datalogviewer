# DataLogViewer Plan D — Scatter View, Export and v0.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the scatter view and PNG/CSV export, then release v0.2.0.

**Architecture:**

- Pure helpers carry the logic: `src/charts/scatterData.ts` (point selection and sampling) and `src/data/exportCsv.ts` (CSV text and file names).
- `ScatterView` lazy-loads Plotly (`plotly.js-gl2d-dist-min`) with a dynamic import, so the main bundle doesn't grow.
- PNG export composes the chart canvases (and legend text) onto one canvas.

**Tech Stack:** As Plan C, plus `plotly.js-gl2d-dist-min` (lazy chunk).

**Spec:** `docs/superpowers/specs/2026-10-17-datalogviewer-tier2-analyst-design.md` §5, §6, §11.

## Global Constraints

- All earlier Global Constraints apply.
- Plotly is only ever loaded through `import('plotly.js-gl2d-dist-min')`; the main entry chunk must not contain it.
- Scatter caps drawn points at 200,000, evenly spaced, and says so.
- **Colour-by ramp** (dataviz sequential blue):
  - dark theme: `#184f95` → `#5598e7` → `#cde2fb` (low → high, low values recede into the dark surface);
  - light theme: `#86b6ef` → `#2a78d6` → `#0d366b`.
- CSV: comma-separated, `.` decimals, `Name (unit)` headers, NaN → empty cell, file `<log name>-<start>-<end>s.csv` (`row<start>-<end>` for index logs).
- PNG: `<log name>-charts.png`; scatter PNG: `<log name>-scatter.png`.
- Log name = file name without extension.

## Review Focus

- A scatter axis or colour channel that is missing from the current log, or contains only NaN → a clear "No points to show" state, not a blank or broken plot. Test in Task 1.
- Opening Scatter while offline / Plotly fails to load → an error with Retry. Test in Task 2.
- CSV export of a range containing NaN, text channels and calculated channels → empty cells for NaN; text quoted when it contains commas or quotes. Test in Task 3.
- PNG export with the Inspector open or on a narrow screen → captures only the chart panes, at device pixel ratio. Test in Task 4.

---

### Task 1: Scatter data and controls

**Files:** Create `src/charts/scatterData.ts`, `src/ui/ScatterControls.tsx`; modify `src/ui/Toolbar.tsx` (Chart | Scatter | Table); tests `tests/unit/charts/scatterData.test.ts`, `tests/unit/ui/ScatterControls.test.tsx`.

**Interfaces — Produces:**

- `type ScatterScope = 'view' | 'selection' | 'all'`
- `scatterPoints(log: Log, cfg: ScatterConfig, scope: XRange | null, maxPoints = 200_000): { x: Float64Array; y: Float64Array; c: Float64Array | null; t: Float64Array; total: number; shown: number } | { error: string }`
  - Channels are resolved with `findChannel`; `scope` is `null` for the whole log.
  - Rows where x or y is NaN are skipped; above `maxPoints` an evenly spaced sample is taken.
  - Errors: `"Choose an X and a Y channel"`, `"[name] isn't in this log"`, `"No points to show"`.
- `defaultScatter(log: Log): ScatterConfig | null` — the first two numeric non-time channels.
- `ScatterControls({ log, scope, onScope })` — three searchable `<select>`s (X, Y, Colour by with a "None" option) writing `setScatter`, plus a scope `ToggleGroup` (View / Selection — disabled without a selection — / Whole log).

- [ ] **Tests first:**
  - points within the scope;
  - NaN rows skipped;
  - 1,000 rows capped at 100 → `shown: 100`, `total: 1000`, evenly spaced;
  - **Review Focus:** a missing channel → its error; all-NaN → "No points to show";
  - `defaultScatter` on the demo-style header → Engine Speed / MAP;
  - controls: choosing X updates the layout's scatter config; Selection is disabled with no selection.
- [ ] Implement, PASS, commit `feat(scatter): point selection, sampling and controls`.

### Task 2: Scatter view (lazy Plotly)

**Files:** `npm install plotly.js-gl2d-dist-min`; create `src/charts/plotly.ts` (typed loader), `src/ui/ScatterView.tsx`; modify `src/ui/AppShell.tsx` (view `'scatter'`), `src/globals.d.ts` (module declaration); tests `tests/unit/ui/ScatterView.test.tsx` (loader mocked), E2E.

**Interfaces:**

- `loadPlotly(): Promise<PlotlyLike>` — memoized dynamic import; it resets after a failure so Retry works.
- `ScatterView({ log })`:
  - shows "Loading scatter view…" until Plotly loads; on failure, an alert with **Retry**;
  - then `Plotly.react` with one `scattergl` trace (markers 3 px, opacity 0.6), the colour ramp from Global Constraints with a colour bar titled with the colour channel header, and hover showing x, y, colour and time;
  - axis titles are the channel headers;
  - paper/plot background transparent, font and grid colours from `readChartTheme()`;
  - a caption when sampled ("Showing 200,000 of 1,000,000 points");
  - re-renders on config, scope, log or theme change; `Plotly.purge` on unmount.
- Scope:
  - `'view'` uses `range ?? bounds`;
  - `'selection'` uses `selection`, falling back to the view when cleared;
  - `'all'` uses `null`.

- [ ] **Tests first:**
  - with the loader mocked to a fake `{ react, purge }`, the view calls `react` with axis titles from the config;
  - **Review Focus:** a rejected loader → alert + Retry; Retry calls the loader again;
  - E2E: Scatter shows a WebGL canvas (`.gl-canvas-context` or `canvas` inside `.js-plotly-plot`) and axis titles "Engine Speed (rpm)" / "MAP (kPa)";
  - `npm run build` → Plotly lives in a separate chunk (the entry chunk stays < 400 KB).
- [ ] Implement, PASS, commit `feat(scatter): lazy-loaded Plotly scatter view`.

### Task 3: CSV export

**Files:** Create `src/data/exportCsv.ts`; modify `src/ui/Toolbar.tsx` (overflow "Export CSV"), `src/ui/Inspector.tsx` (Range tab "Export CSV"), `src/ui/AppShell.tsx` (handler); tests `tests/unit/data/exportCsv.test.ts`, E2E download.

**Interfaces:**

- `buildCsv(log: Log, channels: Channel[], i0: number, i1: number): string`
  - header `Time (s)` (or `Row`), then `header` per channel;
  - numbers via `String(v)`; NaN → empty;
  - text quoted when it contains `,` `"` or a newline (with `""` escaping).
- `csvFileName(log: Log, r: XRange): string`
- `exportCsv(log)` in AppShell:
  - columns: plotted channels (deduplicated across panes, in pane order);
  - range: the selection, else the view (`range ?? bounds`);
  - `downloadBlob`.

- [ ] **Tests first:**
  - header/units; **Review Focus:** NaN → empty, text with a comma quoted, calculated channel values present;
  - file names for time and index logs;
  - E2E: Export CSV from the overflow menu downloads `demo-run-0-479.95s.csv`, whose first line starts `Time (s),Engine Speed (rpm),MAP (kPa)`.
- [ ] Implement, PASS, commit `feat: export the visible range or selection as CSV`.

### Task 4: PNG export

**Files:** Create `src/charts/exportPng.ts`; modify `src/ui/Toolbar.tsx` (overflow "Export PNG"), `src/ui/AppShell.tsx`, `src/ui/ScatterView.tsx` (expose the export through a ref callback); tests `tests/unit/charts/exportPng.test.ts` (pure layout math), E2E download.

**Interfaces:**

- `pngLayout(panes: { width: number; height: number }[], legendHeight: number, gap: number): { width: number; height: number; offsets: number[] }`
- `exportChartsPng(root: HTMLElement, background: string, fileName: string): Promise<void>`
  - for each `[data-testid=chart-pane]` in `root`: draw its legend text line (series name, unit, value at the cursor — from the DOM) and its uPlot canvas (`.uplot canvas`) at device pixel ratio;
  - `canvas.toBlob` → `downloadBlob`.
- In Scatter view, Export PNG calls `Plotly.downloadImage(el, { format: 'png', filename })`.

- [ ] **Tests first:**
  - `pngLayout` stacks panes with legend rows and gaps;
  - E2E: Export PNG downloads `demo-run-charts.png` with a PNG signature (first bytes `89 50 4E 47`).
- [ ] Implement, PASS, commit `feat: export charts as PNG`.

### Task 5: Docs, review, release

- [ ] README: scatter + export features; Roadmap v0.2 done.
- [ ] CHANGELOG: move Unreleased to `## [0.2.0] - <date>` with scatter + export added.
- [ ] Full verification (lint, typecheck, unit, E2E).
- [ ] **Whole-branch review** (Plans C and D together, one fresh reviewer); fix pass for Critical/Important findings with failing-first tests.
- [ ] STOP — confirm with the user: push `tier2`, open a PR, merge after CI (deploys), tag `v0.2.0`, create the GitHub release.
