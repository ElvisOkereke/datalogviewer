# DataLogViewer Plan B — Tier 1 Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary load & inspect screen with the Tier 1 "Workbench": channel sidebar, stacked uPlot chart panes with a synced crosshair, zoom/pan, overview strip, Inspector, table view, persisted layout, and release it as v0.1.0.

**Architecture:** Pure modules (`src/charts/range.ts`, `src/data/timeIndex.ts`, `src/state/layout.ts`, `src/charts/buildOptions.ts`, `src/ui/shortcuts.ts`) hold every decision and are unit-tested. Two Zustand stores sit on top: `viewStore` (x-range, cursor, focused pane — not persisted) and `layoutStore` (panes and series — persisted to `localStorage`). React components are thin: `ChartPane` and `OverviewStrip` wrap uPlot and talk only to the stores; real canvas behaviour is verified with Playwright, because jsdom has no canvas.

**Tech Stack:** Plan A stack plus uPlot 1.6.32, shadcn/ui (new-york style, Radix) with `tw-animate-css`, react-resizable-panels 4.x (`Group`/`Panel`/`Separator`), @tanstack/react-virtual 3.x, lucide-react, sonner (via shadcn).

**Spec:** `docs/superpowers/specs/2026-10-16-datalogviewer-web-tier1-design.md` (§4.5, §6, §7, §8, §9, §10). Builds on Plan A (`docs/superpowers/plans/2026-10-17-plan-a-foundation-and-data.md`), already merged.

## Global Constraints

- All Plan A Global Constraints still apply (base `/datalogviewer/`, no React in `src/data`/`src/io`, NaN never shown as 0, self-hosted fonts, no tracking, no source maps, `dlv.theme` key, colours from CSS variables, outward actions need user confirmation).
- `src/charts/*.ts` (non-`.tsx`) and `src/state/layout.ts` must not import React.
- Persisted layout lives under `localStorage` key `dlv.layout.v1` with `version: 1`; every storage access is wrapped in try/catch (Zustand `persist` with a storage adapter that swallows errors). Log data is never persisted.
- Series colours are stored as a palette slot id `'s1'…'s8'` (resolved per theme) or a custom `'#rrggbb'`. Palette (validated with the dataviz skill's validator against `#0e1013` and `#f7f8fa`; dark passes all checks; light slots s3/s4/s5 are below 3:1, so values must always be visible as text in legends/Inspector/table — the "relief rule"):
  - dark: s1 `#3987e5`, s2 `#d95926`, s3 `#199e70`, s4 `#c98500`, s5 `#d55181`, s6 `#008300`, s7 `#9085e9`, s8 `#e66767`
  - light: s1 `#2a78d6`, s2 `#eb6834`, s3 `#1baf7a`, s4 `#eda100`, s5 `#e87ba4`, s6 `#008300`, s7 `#6250d6`, s8 `#e34948`
  - New series take the lowest slot not used in their pane; a 9th series in one pane reuses slots in order (spec allows unlimited series; the cap is soft).
- Per-channel y-scales are the default (spec §4.5) — a deliberate, user-approved exception to the dataviz "one axis" rule: only one y-axis is drawn at a time (the legend-hovered series, default first), and every value is readable in the legend. Each scale's range is the channel's whole-log min/max padded 5% (it does not rescale while panning).
- uPlot cursor sync key: `'dlv'`. Text never uses a series colour (series colour appears only as a swatch next to text).
- Numeric readouts use the `num` utility (JetBrains Mono, tabular numbers).
- Component unit tests mock `@/charts/ChartPane` and `@/charts/OverviewStrip` (jsdom has no canvas); chart behaviour is tested in Playwright.

## Review Focus

- Loading a second log while zoomed in or with a pinned cursor — expected: view resets to the full range and the cursor clears; nothing reads past the end of the new arrays. Test in Task 2.
- A channel whose values are all NaN, or constant (min === max) — expected: the pane still draws (range falls back to `[0, 1]` or `value ± 1`). Test in Task 4.
- Corrupted or future-version saved layout in `localStorage` — expected: the app starts with the default layout instead of crashing. Test in Task 3.
- Removing the focused pane, or the last pane — expected: focus moves to a remaining pane; with no panes, the main area offers "Add chart" instead of a blank screen. Tests in Tasks 2 and 3.
- A log whose time axis is the row index — expected: axis and readouts say "row" / show integers, not seconds. Test in Task 4.

## File Map

```
components.json                       shadcn config (new-york, Tailwind v4, css src/index.css)
src/lib/utils.ts                      cn()
src/components/ui/*                   shadcn primitives (generated)
src/data/timeIndex.ts                 nearestIndex
src/charts/range.ts                   XRange, clampRange, zoomRange, panRange, resizeRange
src/charts/palette.ts                 SERIES_SLOTS, resolveSeriesColor, nextSeriesColor
src/charts/chartTheme.ts              ChartTheme, readChartTheme
src/charts/buildOptions.ts            buildPaneOptions, toPlotValues, seriesRange, formatValue
src/charts/navigation.ts              navigationPlugin (uPlot plugin: wheel/drag/shift-drag/dblclick/touch)
src/charts/ChartPane.tsx              uPlot wrapper + Legend
src/charts/Legend.tsx                 legend row with values + series menu
src/charts/OverviewStrip.tsx          full-log mini chart + draggable window
src/state/layout.ts                   PersistedLayout types, defaultLayout, bindLayout, migrateLayout
src/state/layoutStore.ts              useLayoutStore (persisted)
src/state/viewStore.ts                useViewStore
src/ui/shortcuts.ts                   shortcutFor(event) → ShortcutAction | null
src/ui/useShortcuts.ts                window keydown → store actions
src/ui/report.ts                      reportUrl (moved from LoadScreen)
src/ui/AppShell.tsx  Toolbar.tsx  Sidebar.tsx  PaneStack.tsx  Inspector.tsx  DataTable.tsx
src/ui/EmptyState.tsx  LoadFeedback.tsx  LargeFileDialog.tsx  AboutDialog.tsx  ShortcutsDialog.tsx
src/ui/ErrorBoundary.tsx  useFileDrop.ts  useIsNarrow.ts
src/ui/LoadScreen.tsx                 DELETED (Task 11)
tests/unit/...                        mirrors src
tests/e2e/workbench.spec.ts           Workbench end-to-end
```

---

### Task 1: UI kit (shadcn/ui) and chart dependencies

**Files:**

- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/{button,dropdown-menu,dialog,alert-dialog,tooltip,sonner,input,sheet,popover,toggle-group}.tsx` (generated)
- Modify: `package.json`, `src/index.css` (add `@import 'tw-animate-css';` after the Tailwind import; nothing else)
- Test: `tests/unit/lib/utils.test.ts`

**Interfaces:**

- Produces: `cn(...inputs: ClassValue[]): string`; shadcn components importable from `@/components/ui/<name>`; packages `uplot`, `react-resizable-panels`, `@tanstack/react-virtual`, `lucide-react` installed.

- [ ] **Step 1: Install dependencies**

```bash
npm install uplot@^1.6.32 react-resizable-panels@^4.14.5 @tanstack/react-virtual@^3.14.21 lucide-react clsx tailwind-merge class-variance-authority tw-animate-css
```

- [ ] **Step 2: Write `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 3: Failing test** — `tests/unit/lib/utils.test.ts`: `cn('px-2', false, 'px-4')` → `'px-4'`; `cn('a', undefined, 'b')` → `'a b'`. Run `npx vitest run tests/unit/lib` → FAIL (module missing).

- [ ] **Step 4: Implement `cn`** in `src/lib/utils.ts` (`twMerge(clsx(inputs))`). Test passes.

- [ ] **Step 5: Generate primitives**

```bash
npx shadcn@latest add button dropdown-menu dialog alert-dialog tooltip sonner input sheet popover toggle-group --yes
git diff --stat src/index.css
```

Expected: components created under `src/components/ui/`. If the CLI edited `src/index.css` beyond adding imports (e.g. injecting its own `:root` colours), revert those hunks — the Instrument tokens in `src/index.css` already use shadcn's variable names. `sonner.tsx` imports `next-themes`; replace that with our theme: read `document.documentElement.dataset.theme` (`'dark' | 'light'`) and pass it as `theme`.

- [ ] **Step 6: Verify** — `npm run typecheck && npx eslint . && npx vitest run && npm run build` all clean (add `src/components/ui` to ESLint ignores only if generated code trips a rule you cannot fix by config; prefer fixing).

- [ ] **Step 7: Commit** — `chore(ui): add shadcn/ui primitives and chart dependencies`.

---

### Task 2: Range math, time index and the view store

**Files:**

- Create: `src/charts/range.ts`, `src/data/timeIndex.ts`, `src/state/viewStore.ts`
- Test: `tests/unit/charts/range.test.ts`, `tests/unit/data/timeIndex.test.ts`, `tests/unit/state/viewStore.test.ts`

**Interfaces:**

- Produces:
  - `type XRange = { min: number; max: number }`
  - `clampRange(r: XRange, bounds: XRange, minSpan: number): XRange` — keeps span ≥ `minSpan` (or the whole bounds if smaller), shifts inside bounds without changing span when possible.
  - `zoomRange(r: XRange, anchor: number, factor: number, bounds: XRange, minSpan: number): XRange` — `factor < 1` zooms in; the value under `anchor` stays put; result clamped.
  - `panRange(r: XRange, delta: number, bounds: XRange): XRange` — shifts by `delta`, span preserved, stops at bounds.
  - `resizeRange(r: XRange, edge: 'min' | 'max', value: number, bounds: XRange, minSpan: number): XRange`
  - `minSpanFor(time: Float64Array): number` — 10 samples' worth: `10 * (last - first) / (n - 1)`, or `1` when n < 2.
  - `nearestIndex(time: Float64Array, t: number): number` — binary search; clamps to `[0, n-1]`; ties go to the lower index.
  - `useViewStore` with state `{ range: XRange | null; bounds: XRange | null; minSpan: number; cursor: number | null; pinned: boolean; focusedPaneId: string | null }` and actions `resetForLog(time: Float64Array): void`, `setRange(r: XRange): void`, `fit(): void`, `zoomAt(anchor: number, factor: number): void`, `pan(delta: number): void`, `setCursor(i: number | null): void` (ignored while pinned), `pin(i: number): void`, `unpin(): void`, `stepCursor(delta: number, rowCount: number): void` (starts from the range's first visible sample when the cursor is null; pins), `focusPane(id: string | null): void`.
  - `range === null` means "full log".

- [ ] **Step 1: Failing tests**

`range.test.ts` — at least:

```ts
const B = { min: 0, max: 100 };
expect(zoomRange({ min: 0, max: 100 }, 50, 0.5, B, 1)).toEqual({ min: 25, max: 75 });
expect(zoomRange({ min: 0, max: 100 }, 0, 0.5, B, 1)).toEqual({ min: 0, max: 50 }); // anchor at edge stays
expect(zoomRange({ min: 40, max: 60 }, 50, 4, B, 1)).toEqual({ min: 10, max: 90 }); // zoom out
expect(zoomRange({ min: 0, max: 100 }, 50, 10, B, 1)).toEqual(B); // never past bounds
expect(zoomRange({ min: 49, max: 51 }, 50, 0.01, B, 1)).toEqual({ min: 49.5, max: 50.5 }); // minSpan
expect(panRange({ min: 10, max: 20 }, 5, B)).toEqual({ min: 15, max: 25 });
expect(panRange({ min: 90, max: 100 }, 5, B)).toEqual({ min: 90, max: 100 });
expect(resizeRange({ min: 10, max: 20 }, 'max', 15, B, 1)).toEqual({ min: 10, max: 15 });
expect(resizeRange({ min: 10, max: 20 }, 'min', 19.8, B, 1)).toEqual({ min: 19, max: 20 });
expect(clampRange({ min: -5, max: 5 }, B, 1)).toEqual({ min: 0, max: 10 });
expect(minSpanFor(Float64Array.of(0, 0.05, 0.1))).toBeCloseTo(0.5);
```

`timeIndex.test.ts`: `nearestIndex([0,1,2,3], 1.4)` → 1; `1.6` → 2; `1.5` → 1; `-5` → 0; `99` → 3; works on 1,000,000 samples in < 1 ms per call (loop 1,000 lookups, assert < 50 ms).
`viewStore.test.ts`:

- `resetForLog(Float64Array.of(0,1,2,3,4))` → `range: null`, `bounds: {0,4}`, `cursor: null`, `pinned: false`.
- **Review Focus:** zoom in, pin cursor at 3, then `resetForLog` of a 2-sample log → `range: null`, `cursor: null`, `pinned: false`.
- `zoomAt(2, 0.5)` from full range → `range {1, 3}`; `fit()` → `null`.
- `setCursor(2)` while pinned at 1 → stays 1; `unpin()` then `setCursor(2)` → 2.
- `stepCursor(+1, 5)` with cursor null and full range → `cursor 1, pinned true`; `stepCursor(+10, 5)` → 4 (clamped).
- `focusPane('p2')` sets `focusedPaneId`.

- [ ] **Step 2: Run → FAIL** (modules missing).
- [ ] **Step 3: Implement** the three modules to the signatures above. `zoomAt`/`pan` operate on `range ?? bounds` and store `null` when the result equals `bounds`.
- [ ] **Step 4: Run → PASS**; full suite green.
- [ ] **Step 5: Commit** — `feat(view): range math, nearest-index lookup and view store`.

---

### Task 3: Layout model and persisted layout store

**Files:**

- Create: `src/charts/palette.ts`, `src/state/layout.ts`, `src/state/layoutStore.ts`
- Test: `tests/unit/charts/palette.test.ts`, `tests/unit/state/layout.test.ts`, `tests/unit/state/layoutStore.test.ts`

**Interfaces:**

- Consumes: `Log`, `Channel`, `findChannel` (Plan A).
- Produces:
  - `type SeriesColor = string` (`'s1'…'s8'` or `'#rrggbb'`); `SERIES_SLOTS: Record<'dark' | 'light', string[]>` (values in Global Constraints); `resolveSeriesColor(c: SeriesColor, theme: 'dark' | 'light'): string`; `nextSeriesColor(used: SeriesColor[]): SeriesColor`.
  - `interface SeriesRef { header: string; color: SeriesColor; scale?: { min?: number; max?: number } }`
  - `interface PaneLayout { id: string; size: number; sharedAxis: boolean; series: SeriesRef[] }`
  - `interface PersistedLayout { version: 1; panes: PaneLayout[]; sidebarWidth: number; inspectorOpen: boolean; view: 'chart' | 'table' }` (spec §8; theme lives in `dlv.theme`)
  - `interface BoundSeries extends SeriesRef { channel: Channel | null }`; `interface BoundPane extends Omit<PaneLayout, 'series'> { series: BoundSeries[] }`
  - `EMPTY_LAYOUT: PersistedLayout` (no panes, sidebarWidth 240, inspectorOpen false, view 'chart')
  - `defaultLayout(log: Log): PersistedLayout` — spec §8: two panes; first two numeric non-time channels in pane 1, the third in pane 2 (fewer channels → fewer series; one numeric channel → one pane).
  - `bindLayout(layout: PersistedLayout, log: Log): BoundPane[]` — uses `findChannel`; unmatched → `channel: null`.
  - `migrateLayout(raw: unknown): PersistedLayout` — accepts only a structurally valid `version: 1` object; anything else → `EMPTY_LAYOUT`.
  - `useLayoutStore` state = `PersistedLayout` + actions: `ensureLayoutFor(log: Log)` (applies `defaultLayout` only when there are no panes), `resetLayout(log: Log)`, `addPane(): string` (returns new id, size split evenly), `removePane(id: string)`, `setPaneSizes(sizes: Record<string, number>)`, `addSeries(paneId: string, header: string)` (no duplicates within a pane; color = `nextSeriesColor` of that pane), `removeSeries(paneId: string, header: string)`, `setSeriesColor(paneId, header, color: SeriesColor)`, `setSeriesScale(paneId, header, scale?: { min?: number; max?: number })`, `toggleSharedAxis(paneId)`, `setInspectorOpen(open: boolean)`, `setView(view: 'chart' | 'table')`, `setSidebarWidth(px: number)`.
  - Persistence: Zustand `persist`, name `dlv.layout.v1`, `version: 1`, storage = `createJSONStorage(() => safeStorage)` where `safeStorage` wraps `localStorage` get/set/remove in try/catch; `merge` runs persisted state through `migrateLayout`.

- [ ] **Step 1: Failing tests**
  - palette: `nextSeriesColor([])` → `'s1'`; `(['s1','s3'])` → `'s2'`; all eight used → `'s1'`; `resolveSeriesColor('s1','dark')` → `'#3987e5'`; `resolveSeriesColor('#123456','light')` → `'#123456'`; unknown slot → slot 1 colour.
  - layout (use `parseCsvText` on small CSVs to build logs):
    - `defaultLayout` of the demo-style header `Time (s),RPM,MAP (kPa),AFR,Mode` → pane 1 series `['RPM','MAP (kPa)']` (colours s1, s2), pane 2 `['AFR']` (s1); `Time` excluded (time channel), `Mode` excluded (text).
    - one numeric channel → exactly one pane with one series.
    - `bindLayout` binds by exact header and by case-insensitive name (`'map (psi)'` → `MAP (kPa)` channel); unknown header → `channel: null`.
    - **Review Focus:** `migrateLayout(null)`, `migrateLayout('junk')`, `migrateLayout({ version: 2, panes: [] })`, `migrateLayout({ version: 1, panes: 'x' })` → all `EMPTY_LAYOUT`; a valid object round-trips unchanged.
  - layoutStore (reset state in `beforeEach`; stub `localStorage` per test):
    - `ensureLayoutFor(log)` on empty → default panes; called again after `removeSeries` → unchanged (does not reapply).
    - `addSeries` twice with the same header → one entry; second distinct header gets `'s2'`.
    - **Review Focus:** `removePane` of the only pane → `panes: []` (no crash); `addPane()` then works.
    - persistence writes JSON under `dlv.layout.v1` containing `"version":1`; a `localStorage.setItem` that throws does not throw out of `addSeries`.

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS** (full suite).
- [ ] **Step 5: Commit** — `feat(layout): persisted layout model with default layout and re-binding`.

---

### Task 4: Chart option builder

**Files:**

- Create: `src/charts/chartTheme.ts`, `src/charts/buildOptions.ts`
- Test: `tests/unit/charts/buildOptions.test.ts`

**Interfaces:**

- Consumes: `BoundPane`, `resolveSeriesColor`, `Log`.
- Produces:
  - `interface ChartTheme { mode: 'dark' | 'light'; text: string; muted: string; grid: string; border: string; cursor: string; font: string; monoFont: string }`; `readChartTheme(): ChartTheme` (reads `--foreground`, `--muted-foreground`, `--border`, `--primary` etc. via `getComputedStyle(document.documentElement)`; `mode` from `data-theme`).
  - `toPlotValues(values: Float64Array): Float64Array | (number | null)[]` — returns the same array when it contains no NaN, else a copy with `null` for NaN (uPlot draws gaps for null).
  - `seriesRange(ch: Channel, manual?: { min?: number; max?: number }): [number, number]` — channel min/max padded 5% of span; constant → `[v - 1, v + 1]`; all-NaN → `[0, 1]`; manual bounds override either end.
  - `formatValue(v: number | null | undefined, ch: Channel | null): string` — `'—'` for null/NaN; ≥ 1000 → no decimals with thousands separators; otherwise up to 3 significant decimals (`12.41`, `0.052`); unit is not appended (legend shows it).
  - `formatTime(t: number, source: TimeSource): string` — column time → seconds with up to 3 decimals + `' s'`; index → `'row ' + integer`.
  - `buildPaneOptions(args: { pane: BoundPane; log: Log; theme: ChartTheme; width: number; height: number; axisHeader: string | null }): { opts: uPlot.Options; data: uPlot.AlignedData }` — x scale key `'x'` (`time: false`); one y scale per bound series (`'y:' + header`) or a single `'y'` when `pane.sharedAxis` (range = union of series ranges); exactly one visible y axis, bound to `axisHeader`'s scale (default: first bound series); unbound series are omitted from `series`/`data`; `cursor.sync = { key: 'dlv' }`; `legend.show = false` (React legend); line width 2 px, `points.show = false`; `spanGaps: false`; axis/grid colours from `theme`; x axis `values` formatter = `formatTime`.

- [ ] **Step 1: Failing tests** — build logs with `parseCsvText`; theme stub object.
  - `toPlotValues(Float64Array.of(1, 2))` returns the identical array (`toBe`); `toPlotValues(Float64Array.of(1, NaN))` → `[1, null]`.
  - `seriesRange` on 0..100 → `[-5, 105]`; **Review Focus:** constant 7 → `[6, 8]`; all-NaN → `[0, 1]`; manual `{ max: 50 }` → `[-5, 50]`.
  - `formatValue(5240.4)` → `'5,240'`; `12.4123` → `'12.412'`; `null` → `'—'`; `NaN` → `'—'`.
  - **Review Focus:** `formatTime(42, { kind: 'index' })` → `'row 42'`; `formatTime(1.23456, column)` → `'1.235 s'`.
  - `buildPaneOptions` for a pane with RPM + AFR: `opts.series.length === 3`; scales `'y:RPM'` and `'y:AFR'` exist with the `seriesRange` values; exactly one entry in `opts.axes` (after the x axis) has `show !== false` and its `scale` is `'y:RPM'`; with `axisHeader: 'AFR'` the visible axis scale is `'y:AFR'`; `sharedAxis: true` → all series use scale `'y'`; a series with `channel: null` is omitted; `data[0]` is `log.time`; `opts.cursor.sync.key === 'dlv'`; series stroke equals `resolveSeriesColor(color, theme.mode)`.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(charts): pure uPlot option builder with per-channel scales`.

---

### Task 5: ChartPane, Legend and cursor sync

**Files:**

- Create: `src/charts/ChartPane.tsx`, `src/charts/Legend.tsx`
- Test: `tests/unit/charts/Legend.test.tsx`; E2E in `tests/e2e/workbench.spec.ts` (created here)

**Interfaces:**

- Consumes: `buildPaneOptions`, `readChartTheme`, `formatValue`, `useViewStore`, `useLayoutStore`, `BoundPane`.
- Produces:
  - `ChartPane(props: { pane: BoundPane; log: Log; focused: boolean }): JSX.Element` — container `data-testid="chart-pane"` with `data-pane-id`, amber left edge when focused, clicking it calls `focusPane`. Creates the uPlot instance in an effect; rebuilds when `pane` series/sharedAxis/colours, `log`, theme or `axisHeader` change; `ResizeObserver` → `u.setSize`; subscribes to `viewStore.range` → `u.setScale('x', range ?? bounds)` (guard against echo); uPlot `setCursor` hook → `setCursor(u.cursor.idx ?? null)`; when `pinned`, draws the cursor at the pinned index via `u.setCursor({ left: u.valToPos(time[i], 'x'), top: … })`. Destroys the instance on unmount.
  - `Legend(props: { pane: BoundPane; log: Log; onHoverSeries(header: string | null): void }): JSX.Element` — one entry per series: swatch (series colour), name, unit, value at `viewStore.cursor` via `formatValue` (`data-testid="legend-value"`); unbound series render struck through with the text "not in this log"; clicking an entry opens a `DropdownMenu`: Remove, Colour (8 slot swatches), Scale (Auto / Manual min–max via two `Input`s), "Use for y-axis".
  - Theme changes: `ChartPane` re-reads `readChartTheme()` when `document.documentElement` `data-theme` changes (MutationObserver).

- [ ] **Step 1: Failing Legend test** (`Legend.test.tsx`) — with a log from `parseCsvText('Time (s),RPM\n0,800\n0.05,810')` and a pane binding `RPM` plus missing `Boost`: renders `RPM` and `rpm`; with `useViewStore.setState({ cursor: 1 })` the RPM `legend-value` reads `810`; with cursor null it reads `—`; `Boost` entry contains `not in this log`; choosing Remove in the RPM menu calls `useLayoutStore.getState().removeSeries` (assert via store state).
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement Legend, then ChartPane.**
- [ ] **Step 4: Run unit tests → PASS.**
- [ ] **Step 5: E2E (temporary mount):** until Task 11 replaces it, render the active log's bound panes below the summary in `LoadScreen` (one line: `{panes.map(p => <ChartPane …/>)}` after `ensureLayoutFor`). Add to `tests/e2e/workbench.spec.ts`:
  - load demo → two `chart-pane` elements each containing a `canvas`;
  - hover at 50% of the first pane → every `legend-value` in **both** panes is not `—` (crosshair sync);
  - move the mouse to 75% → the RPM legend value changes.
    Run `npm run test:e2e` → PASS.
- [ ] **Step 6: Commit** — `feat(charts): uPlot chart pane with synced crosshair and live legend`.

---

### Task 6: Navigation — zoom, pan, box-zoom, fit, pin, keyboard

**Files:**

- Create: `src/charts/navigation.ts`, `src/ui/shortcuts.ts`, `src/ui/useShortcuts.ts`
- Modify: `src/charts/ChartPane.tsx` (register the plugin; `cursor.drag = { x: true, y: false, setScale: false }`)
- Test: `tests/unit/ui/shortcuts.test.ts`; E2E additions

**Interfaces:**

- Consumes: `useViewStore` actions, `zoomRange`/`panRange` (through the store).
- Produces:
  - `navigationPlugin(handlers: { zoomAt(anchor: number, factor: number): void; pan(delta: number): void; setRange(r: XRange): void; fit(): void; pin(index: number): void }): uPlot.Plugin` — wheel: `factor = deltaY > 0 ? 1.25 : 0.8`, anchor = `u.posToVal(offsetX, 'x')`, `preventDefault`; pointer drag without Shift (mouse or one touch pointer): `pan(-(dxPx) * (range span / plot width))` per move; Shift+drag: let uPlot's select run (call the original `mousedown` handler only when `e.shiftKey`), then in `setSelect` call `setRange` with the selected x span and clear the selection; `dblclick` → `fit`; a click with < 4 px movement → `pin(u.cursor.idx)`; two touch pointers → pinch: `zoomAt(midpoint, prevDistance / distance)`.
  - `type ShortcutAction = { type: 'step'; delta: number } | { type: 'home' } | { type: 'end' } | { type: 'zoom'; factor: number } | { type: 'fit' } | { type: 'unpin' } | { type: 'help' }`
  - `shortcutFor(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>, targetIsEditable: boolean): ShortcutAction | null` — `ArrowRight` → step +1 (Shift → +10), `ArrowLeft` → −1/−10, `Home`/`End`, `+`/`=` → zoom 0.8, `-` → zoom 1.25, `f`/`F` → fit, `Escape` → unpin, `?` → help; `null` when `targetIsEditable` or any of Ctrl/Meta/Alt is held.
  - `useShortcuts(onHelp: () => void)` — window `keydown` listener dispatching to the stores (zoom anchors at the cursor's time, else range centre; home/end pin index 0 / rowCount−1).

- [ ] **Step 1: Failing test** `shortcuts.test.ts` covering every mapping above, Shift variants, and the editable/modifier `null` cases.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** `shortcuts.ts`, `useShortcuts.ts`, `navigation.ts`; wire into ChartPane. **Step 4: unit → PASS.**
- [ ] **Step 5: E2E additions** (expose nothing new; assert through the UI): after loading the demo, read the first pane's x-axis tick labels (`.u-axis` text) → wheel up 3× over the pane centre → the first and last tick labels change and the label span shrinks; double-click → labels return to the original; click the pane at 40% → press `ArrowRight` → RPM legend value changes and stays when the mouse leaves the pane; `Escape` then mouse-leave → values return to `—`.
- [ ] **Step 6: Commit** — `feat(charts): wheel zoom, drag pan, box zoom, pinned cursor and keyboard shortcuts`.

---

### Task 7: Overview strip

**Files:**

- Create: `src/charts/OverviewStrip.tsx`
- Test: E2E additions

**Interfaces:**

- Consumes: `useViewStore` (`range`, `bounds`, `setRange`, `fit`), `resizeRange`, `panRange`, `buildPaneOptions` is NOT used — the strip is its own minimal uPlot (one series, no axes, no cursor sync, height 32 px).
- Produces: `OverviewStrip(props: { log: Log; channel: Channel | null }): JSX.Element` — channel = first bound series of the first pane, else the first numeric channel; renders a window overlay `data-testid="overview-window"` positioned from `range ?? bounds` via `u.valToPos`; dragging the window body → `setRange(panRange(...))`; dragging either 6 px edge handle → `setRange(resizeRange(...))`; clicking outside the window centres it there; window spans the full strip when `range === null`.

- [ ] **Step 1: E2E first** (in `workbench.spec.ts`): demo loaded → `overview-window` width ≈ strip width (±2 px); wheel-zoom a chart → window narrower; drag the window right by 100 px → chart x-axis first tick label increases; drag its left edge → window width changes. Run → FAIL (no strip yet; temporarily mount it in the same place as Task 5's panes).
- [ ] **Step 2: Implement OverviewStrip. Step 3: E2E → PASS.**
- [ ] **Step 4: Commit** — `feat(charts): overview strip with draggable, resizable window`.

---

### Task 8: Sidebar channel list

**Files:**

- Create: `src/ui/Sidebar.tsx`
- Test: `tests/unit/ui/Sidebar.test.tsx`

**Interfaces:**

- Consumes: `filterByQuery` (Plan A), `useLayoutStore`, `useViewStore.focusedPaneId`, `resolveSeriesColor`.
- Produces: `Sidebar(props: { log: Log }): JSX.Element` — search `Input` (placeholder `Search {n} channels…`); list in file order (filtered + sorted by `filterByQuery` when a query is typed), virtualized with `@tanstack/react-virtual` when > 200 channels; each row: swatch (its colour if plotted in any pane, else neutral), name, unit (`num`, muted); the time channel is listed with a "time" tag; text channels are greyed, `aria-disabled`, not draggable, tooltip "Text channel — shown in the table and Inspector"; click → `addSeries(focusedPaneId ?? first pane id, header)` (adds a pane first if there are none); `draggable` rows set `dataTransfer` type `application/x-dlv-channel` = header.

- [ ] **Step 1: Failing tests** — log `Time (s),RPM,MAP (kPa),Mode`: renders 4 rows; typing `map` leaves only `MAP`; clicking `RPM` with focused pane `p1` adds RPM to `p1` (store state); clicking `Mode` does nothing and the row has `aria-disabled="true"`; dragstart on `RPM` sets `application/x-dlv-channel` to `RPM`; with zero panes, clicking `RPM` creates a pane containing it.
- [ ] **Step 2: FAIL → Step 3: implement → Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(ui): searchable channel sidebar with click and drag to plot`.

---

### Task 9: Pane stack — resize, add/remove, drop targets, pane menu

**Files:**

- Create: `src/ui/PaneStack.tsx`
- Test: `tests/unit/ui/PaneStack.test.tsx` (ChartPane mocked)

**Interfaces:**

- Consumes: `bindLayout`, `useLayoutStore`, `useViewStore`, `ChartPane`, `Group`/`Panel`/`Separator` from `react-resizable-panels`.
- Produces: `PaneStack(props: { log: Log }): JSX.Element` — vertical `Group` with one `Panel` (id = pane id, `defaultSize` from `pane.size`) per pane separated by `Separator`s; `onLayoutChanged` → `setPaneSizes`; each pane accepts drops of `application/x-dlv-channel` (`addSeries`); a pane header menu (`DropdownMenu`, trigger `aria-label="Chart options"`): "Shared axis" checkbox (`toggleSharedAxis`), "Clear", "Delete chart"; below the last pane a dashed drop zone/button "Add chart" (`addPane`; dropping a channel there creates a pane with it); with zero panes only the "Add chart" zone shows (**Review Focus**); when the focused pane is deleted, focus moves to the previous pane, else the next, else `null` (**Review Focus**).

- [ ] **Step 1: Failing tests** — 2-pane layout → two mocked chart panes; "Delete chart" on focused `p2` → one pane left and `focusedPaneId === 'p1'`; deleting the last pane → "Add chart" visible, no chart panes; drop event with `application/x-dlv-channel=AFR` on pane `p1` → AFR in `p1`; drop on "Add chart" → new pane containing AFR; "Shared axis" toggles `sharedAxis`.
- [ ] **Step 2: FAIL → Step 3: implement → Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(ui): resizable pane stack with drag-and-drop and pane menu`.

---

### Task 10: Inspector and table view

**Files:**

- Create: `src/ui/Inspector.tsx`, `src/ui/DataTable.tsx`
- Test: `tests/unit/ui/Inspector.test.tsx`, `tests/unit/ui/DataTable.test.tsx`

**Interfaces:**

- Consumes: `useViewStore` (`cursor`, `pin`), `formatValue`, `formatTime`, `filterByQuery`, `useVirtualizer`.
- Produces:
  - `Inspector(props: { log: Log }): JSX.Element` — header "At cursor · {formatTime}" (or "Hover a chart" when cursor is null); search `Input`; every channel (numeric and text) with its value at the cursor (`num`), unit muted; text channels show their string.
  - `DataTable(props: { log: Log }): JSX.Element` — virtualized rows (`useVirtualizer`, row height 28 px, overscan 20); sticky header showing `name` and a muted unit line; first column is time (`formatTime`) or row number; the cursor row has `aria-selected="true"` and the selection colour; clicking a row → `pin(index)`; when the cursor changes from elsewhere the table scrolls it into view (`scrollToIndex(cursor, { align: 'center' })`).

- [ ] **Step 1: Failing tests** — Inspector: cursor null → "Hover a chart"; cursor 1 → RPM row shows `810`, Mode row shows its text; search `rp` filters to RPM. DataTable (jsdom: give the scroll container a fixed height via style and mock `getBoundingClientRect`/`offsetHeight` as TanStack's docs advise, or assert on the first rendered rows only): header shows `RPM` and `rpm`; clicking the row for index 1 sets `cursor === 1` and `pinned === true`; with cursor 1 that row has `aria-selected="true"`.
- [ ] **Step 2: FAIL → Step 3: implement → Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(ui): Inspector panel and virtualized table view synced to the cursor`.

---

### Task 11: App shell — toolbar, empty state, loading, dialogs, shortcuts

**Files:**

- Create: `src/ui/AppShell.tsx`, `Toolbar.tsx`, `EmptyState.tsx`, `LoadFeedback.tsx`, `LargeFileDialog.tsx`, `AboutDialog.tsx`, `ShortcutsDialog.tsx`, `ErrorBoundary.tsx`, `useFileDrop.ts`, `report.ts`
- Modify: `src/App.tsx` (renders `<AppShell />` inside `<TooltipProvider>` with `<Toaster />`)
- Delete: `src/ui/LoadScreen.tsx`, `tests/unit/ui/LoadScreen.test.tsx`, temporary mounts from Tasks 5 and 7; update `tests/e2e/load.spec.ts` selectors to the new UI
- Test: `tests/unit/ui/report.test.ts`, `tests/unit/ui/AppShell.test.tsx`, `tests/unit/ui/ErrorBoundary.test.tsx`

**Interfaces:**

- Consumes: everything above; `useLogStore`, `SAMPLES`, `LARGE_FILE_BYTES`, `REPO_URL`.
- Produces:
  - `reportUrl(code: LogErrorCode | 'render-error'): string` — identical privacy rule as Plan A (code + `__APP_VERSION__` only).
  - Layout (spec §6.1): `Toolbar` (brand, file name, rows, duration via `formatTime`; Chart|Table `ToggleGroup` → `setView`; "Layout" menu with "Reset layout"; Inspector toggle; theme cycle button reusing `useTheme`; "Open log" primary button; overflow menu with About and Keyboard shortcuts) → body: `Sidebar` | main (`PaneStack` or `DataTable` by `view`, then `OverviewStrip`) | `Inspector` when `inspectorOpen`.
  - `EmptyState` when no log: centred drop zone, "Open log", "Try a sample log" buttons for each `SAMPLES` entry, one-line privacy note.
  - `useFileDrop(onFile: (f: File) => void)` — window-level dragover/drop; shows a full-window drop overlay while dragging a file.
  - `LargeFileDialog` (`AlertDialog`) replaces `window.confirm` for files over `LARGE_FILE_BYTES`.
  - `LoadFeedback` — progress overlay (`role="progressbar"`) while loading; error card (`role="alert"`) with Dismiss and "Report this file" (`reportUrl(code)`); after a successful load, one `sonner` toast summarising warnings (`"{n} warning(s)"` with a "Details" action listing messages).
  - On every successful load: `useViewStore.resetForLog(log.time)` and `useLayoutStore.ensureLayoutFor(log)`.
  - `ErrorBoundary(props: { label: string; children })` — wraps each pane and the app root; fallback shows "Something went wrong in {label}", "Reload" and "Report" (`reportUrl('render-error')`).
  - `useShortcuts` mounted in `AppShell`; `?` opens `ShortcutsDialog` listing every binding from Task 6 plus mouse gestures.
  - `AboutDialog`: version, repo link, "Your logs never leave your browser."

- [ ] **Step 1: Failing tests** — `report.test.ts`: URL contains the code and version, never a file name. `AppShell.test.tsx` (ChartPane/OverviewStrip mocked): no log → sample buttons visible; with a log in the store → sidebar, pane stack and toolbar file name visible; Table toggle → table rendered, panes not; Inspector toggle shows the Inspector; error status → alert with "Report this file". `ErrorBoundary.test.tsx`: a throwing child renders the fallback with the label.
- [ ] **Step 2: FAIL → Step 3: implement, delete LoadScreen, migrate `load.spec.ts` assertions** (sample load → toolbar shows `9,600 rows`; autodata → toast/notice "No time column found" reachable via Details; no-numbers file → alert).
- [ ] **Step 4: `npx vitest run && npm run test:e2e` → PASS.**
- [ ] **Step 5: Commit** — `feat(ui): Workbench app shell with toolbar, empty state, dialogs and shortcuts`.

---

### Task 12: Narrow screens and touch

**Files:**

- Create: `src/ui/useIsNarrow.ts`
- Modify: `src/ui/AppShell.tsx`, `src/ui/Toolbar.tsx`
- Test: `tests/unit/ui/useIsNarrow.test.ts`; E2E with a mobile viewport

**Interfaces:**

- Produces: `useIsNarrow(): boolean` — `matchMedia('(max-width: 899px)')`, live-updating. When narrow: Sidebar and Inspector render inside `Sheet`s (left/right) opened from toolbar buttons (`aria-label="Channels"`, `aria-label="Inspector"`); toolbar secondary actions collapse into the overflow menu; panes are not resizable (`Group disabled`). Touch gestures come from Task 6's plugin.

- [ ] **Step 1: Failing test** — `useIsNarrow` returns the mocked `matchMedia` result and updates on its `change` event.
- [ ] **Step 2: E2E** — `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })`: load demo → sidebar hidden; tap "Channels" → sheet with the channel list; tap a channel → it's plotted; sheet closes; a tap on a chart pins the cursor (legend values not `—`).
- [ ] **Step 3: Implement → Step 4: unit + E2E PASS.**
- [ ] **Step 5: Commit** — `feat(ui): drawers and touch support on narrow screens`.

---

### Task 13: Persistence end-to-end, performance check, release prep

**Files:**

- Modify: `tests/e2e/workbench.spec.ts`, `README.md`, `CHANGELOG.md`

**Interfaces:** none new.

- [ ] **Step 1: E2E for spec §8 re-binding**:
  - load demo → add `Battery Voltage` via sidebar → reload the page → load demo again → `Battery Voltage` still in the legend;
  - then load the autodata sample → demo-only series show "not in this log", autodata channels can be added, no crash;
  - "Reset layout" → default layout for the current log.
- [ ] **Step 2: Theme E2E** — toggle to light → `html[data-theme="light"]`, charts redraw (canvas still present, legend values unchanged).
- [ ] **Step 3: Performance check (manual-equivalent, automated script, not committed)** — 1M×20 CSV: load, add 4 channels to one pane, wheel-zoom 10× and drag-pan; record longest frame gap via `requestAnimationFrame` (target < 50 ms) and time-to-first-chart. Note the numbers in the PR description.
- [ ] **Step 4: Docs** — README: replace the "Status" note with a short feature list and a screenshot taken with Playwright (`docs/screenshot.png`, dark theme, demo log); CHANGELOG: move items under `## [0.1.0] - <date>` (Workbench UI, synced charts, zoom/pan, overview, Inspector, table, persisted layout, themes, mobile drawers).
- [ ] **Step 5: Full verification** — `npx eslint . && npm run typecheck && npx vitest run && npm run test:e2e`.
- [ ] **Step 6: Commit** — `docs: v0.1.0 README and changelog`.
- [ ] **Step 7: STOP — confirm outward steps with the user**: push branch, open PR, merge after CI, tag `v0.1.0` and create a GitHub release with the changelog section. Execute only after an explicit yes.

---

## Self-review notes

- Spec coverage: §4.5 → Tasks 4–7; §6.1 layout → 11, 12; §6.2 tokens/palette → Global Constraints, 3, 4; §6.3 components → 1, 5–12; §7 interactions → 5–10, 12; §8 persistence/re-binding → 3, 13; §9 error handling → 11 (+ Plan A); §10 testing → every task + 13; §11 release → 13.
- Deviations from the spec, intentional: the light palette's three low-contrast slots are relieved by always-visible text values (spec said ≥ 3:1 for all); series colour is stored as a slot id so theme switches recolour correctly (spec showed a free `color: string`, which this satisfies).
