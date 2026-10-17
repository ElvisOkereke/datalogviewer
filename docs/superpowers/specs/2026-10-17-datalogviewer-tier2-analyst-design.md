# DataLogViewer — Tier 2 "Analyst" Design

**Date:** 2026-10-17
**Status:** Draft. The user asked to proceed from the agreed Tier 2 list without further questions, so every decision below is the author's call unless it comes from the Tier 1 spec or roadmap.
**Builds on:** `docs/superpowers/specs/2026-10-16-datalogviewer-web-tier1-design.md` (v0.1.0, live).
**Release:** v0.2.0.

## 1. Goal

Turn the viewer into an analysis tool. A tuner should be able to:

- derive new channels (e.g. lambda from AFR, boost from MAP);
- select a stretch of a log and read its statistics;
- mark moments worth coming back to;
- plot one channel against another;
- take results out of the app (PNG, CSV) and share a layout with someone else.

### Scope (the roadmap's Tier 2 list)

1. Calculated channels
2. Range selection and range statistics
3. Markers
4. Scatter view
5. Export (PNG and CSV)
6. Layout files (save and load)

### Non-goals

- 2D histograms / RPM × MAP tables, log comparison, filters, other file formats, PWA. These are Tier 3.
- A 1D histogram view (the Tier 1 spec mentioned "scatter/histogram"; histograms move to Tier 3 with the 2D tables).
- Undo/redo.
- Sharing via URLs or any server.

### Anti-goals

- Anything that sends log data off the device.
- Formulas that can run arbitrary code (no `eval`, no `Function`).
- Slowing the 1M-row experience: Tier 1's 60 fps pan/zoom must hold with calculated channels plotted.

## 2. Calculated channels

**Formula language** (author's call; familiar to anyone who has used a spreadsheet or MegaLogViewer):

- **Channel references:** `[Channel Name]` in square brackets, matched by exact header, then by case-insensitive name (Tier 1 `findChannel`). Bare identifiers are allowed when the name is a single word (`RPM`, `AFR`).
- **Numbers and constants:** decimal numbers, plus `pi`.
- **Time:** `t` is the log's time axis in seconds (or the row number for index-based logs).
- **Operators:** `+ - * / ^`, unary minus, parentheses. Comparisons `< <= > >= == !=` give 1 or 0. Logic: `and`, `or`, `not`.
- **Functions:**
  - point-wise: `abs min max sqrt log exp sin cos round floor ceil clamp(x, lo, hi) if(cond, a, b)`;
  - over time: `delta(x)` (change since the previous sample), `rate(x)` (change per second), `smooth(x, n)` (centred moving average over n samples), `lag(x, n)` (value n samples earlier).
- **Missing values:** NaN propagates. Division by zero gives NaN, never Infinity.

**Evaluation:** a hand-written tokenizer and parser build an expression tree. It is evaluated column-wise over `Float64Array`s in one pass per node, with no per-row interpretation and no `eval`. Errors carry a position for the editor (e.g. "Unknown channel [Boost] at 1:5", "Expected ')' at 1:14"). A 1M-row formula with three references must evaluate in under 100 ms.

**Data model:**

- Definitions `{ id, name, unit?, expression }` live in the layout, so they follow the user from log to log like plotted series do.
- For the active log, every definition is evaluated into a `Channel` with `kind: 'calculated'`, appended after the file's channels. The resulting "workbench log" is what every view reads.
- A definition whose references aren't in this log stays listed, greyed out, with the reason ("needs [Lambda]"). Plotted series that point at it show "not in this log", like Tier 1.
- Calculated channels can reference other calculated channels. Cycles are an error ("[A] refers to itself").

**UI:**

- Sidebar: a "New calculated channel" button under the search box, and a "Calculated" group at the end of the list with an `fx` tag on each row. Row actions: Edit and Delete, via a small menu button that appears on hover/focus.
- Editor dialog:
  - fields for name, unit and expression (monospace);
  - an "insert channel" picker that inserts `[Name]` at the caret;
  - live validation as you type (debounced 200 ms), showing either the error with its position or a preview line ("min 0.78 · max 1.21 · 9,600 values");
  - Save is disabled while the expression is invalid.
- Names must be unique among all channels. A name that collides with a file channel is rejected.

## 3. Range selection and statistics

**Interaction change (author's call):** Tier 1 used Shift+drag to zoom to a box. The Tier 1 spec reserved that gesture for range selection in Tier 2, so:

- **Shift+drag** now _selects_ a range. A translucent amber band appears across every chart.
- Zooming to it moves to an explicit action: the **Z** key, or "Zoom to selection" in the Range panel.
- **Esc** clears the selection, then (on a second press) unpins the cursor.
- The shortcuts dialog and README are updated.

**State:** `selection: { min, max } | null` in the view store (not persisted). It clears on loading another log.

**Range panel:** the Inspector becomes tabbed — **Cursor** (today's content), **Range**, **Markers**.

- Making a selection switches to Range and opens the Inspector if it's closed.
- Range shows the start, end and duration (or row span), then, for every numeric and calculated channel: min, mean, max and standard deviation over the selected samples (NaN ignored; "—" if none).
- Search filters channels, as on the Cursor tab.
- Buttons: Zoom to selection, Export CSV (see §6), Clear.

**Performance:** stats for 100 channels over 1M rows compute in under 150 ms, off the input-handling path (computed after the drag ends, not during).

## 4. Markers

- **Adding:** press **M**, or use "Add marker" (Markers tab or the chart pane menu), to drop a marker at the cursor, or at the centre of the view when there is no cursor. Markers are labelled "Marker 1", "Marker 2", … and can be renamed inline.
- **Display:** a dashed vertical line across every chart, with its label at the top of the first pane, in the accent colour.
- **Markers tab:** markers in time order. Clicking one pins the cursor there and pans it into view; each can be renamed or deleted.
- **Persistence:** markers belong to a log, not a layout. They are saved in `localStorage` under `dlv.markers.<fingerprint>`. The fingerprint is a hash of the file name, row count, first/last time and header text, so reopening the same file restores its markers. Storage failures are silent (same rule as the layout).

## 5. Scatter view

- **Toolbar:** the view switch becomes **Chart | Scatter | Table**.
- **Controls** (top of the main area): X channel, Y channel, an optional "Colour by" channel (each a searchable select), and a scope switch:
  - **View** (the current x-range) — the default;
  - **Selection** (when one exists);
  - **Whole log**.
- **Rendering:** Plotly `scattergl`, lazy-loaded only when the Scatter view first opens. Use the smallest Plotly bundle that contains `scattergl` (author's call: `plotly.js-gl2d-dist-min`).
  - Points are 3 px with a little transparency.
  - Colour-by uses a single-hue sequential ramp from the dataviz palette, with a colour bar labelled with the channel and unit.
  - Hover shows x, y, colour value and time.
  - Above 200,000 points, draw an evenly spaced 200,000-point sample and say so ("Showing 200,000 of 1,000,000 points").
- **Persistence:** the scatter configuration `{ x, y, color? }` (headers) is saved in the layout. If no configuration exists, the default is the first two numeric non-time channels.
- **Theme:** follows dark/light.
- **While loading:** a small "Loading scatter view…" placeholder while Plotly downloads; if the download fails, an error with Retry.

## 6. Export

- **PNG:** "Export PNG" in the toolbar overflow menu captures the chart area — every pane with its legend line (drawn as text) and the overview strip excluded — on the theme background, at device pixel ratio. The file is named `<log name>-charts.png`. In Scatter view it exports the scatter plot (Plotly's own image export).
- **CSV:** "Export CSV" (overflow menu and Range panel) writes the time column plus every plotted channel (calculated included) over the selection if there is one, else the visible range.
  - Header row: `Name (unit)`.
  - Decimal point `.`, comma-separated, NaN as an empty cell.
  - The file is named `<log name>-<start>-<end>s.csv`.
- **Downloads:** a Blob plus a temporary `<a download>`; no network.

## 7. Layout files

- The Layout menu gains **Save layout to file…** and **Open layout file…**.
- The file is JSON with extension `.dlvlayout.json`: `{ "app": "DataLogViewer", "kind": "layout", ...PersistedLayout }`.
- Opening one validates it with the same `migrateLayout` used for `localStorage`. A valid file replaces the current layout after a confirm dialog ("Replace your current layout?"); an invalid one shows "This isn't a DataLogViewer layout file" and changes nothing.

## 8. Layout schema v2

`PersistedLayout` becomes `version: 2`:

```ts
interface PersistedLayoutV2 {
  version: 2;
  panes: PaneLayout[];
  sidebarWidth: number;
  inspectorOpen: boolean;
  inspectorTab: 'cursor' | 'range' | 'markers';
  view: 'chart' | 'scatter' | 'table';
  calculated: { id: string; name: string; unit?: string; expression: string }[];
  scatter: { x: string; y: string; color?: string } | null;
}
```

- `migrateLayout` accepts v1, upgrading it with `inspectorTab: 'cursor'`, `calculated: []` and `scatter: null`, as well as v2. Anything else falls back to empty.
- The storage key becomes `dlv.layout.v2`. On first run, the store reads `dlv.layout.v1` if no v2 exists, migrates it, and writes v2.
- Validation keeps Tier 1's rules: colour slots/hex only, plus string length limits (expression ≤ 2,000 characters, name ≤ 100). It also adds two checks the Tier 1 review flagged: unique pane ids and finite pane sizes.

## 9. Keyboard additions

| Key   | Action                                                |
| ----- | ----------------------------------------------------- |
| `M`   | Add a marker                                          |
| `Z`   | Zoom to the selection                                 |
| `Esc` | Clear the selection; a second press unpins the cursor |

Shift+drag in the shortcuts dialog now reads "Select a range".

## 10. Testing

- **Unit:**
  - formula tokenizer/parser/evaluator, covering every operator and function, NaN rules, error positions and cycles;
  - the stats maths;
  - marker fingerprints and persistence;
  - layout v1→v2 migration and layout-file validation;
  - CSV export content;
  - scatter sampling.
- **Component tests** with the existing mocks.
- **Playwright:**
  - create a calculated channel and plot it;
  - Shift+drag shows a band and range stats, Z zooms, Esc clears;
  - add, rename and jump to a marker; markers survive a reload;
  - the scatter view renders a WebGL canvas with axes labelled from the chosen channels;
  - PNG and CSV downloads have the expected names and CSV content;
  - a layout file saves and opens.
- **Performance:** a 1M-row formula evaluates in < 100 ms (unit); pan/zoom with a calculated channel plotted stays at a worst frame ≤ 20 ms (smooth data, automated check).

## 11. Delivery

Two plans, each ending in a working, deployable state:

- **Plan C:** layout v2, calculated channels, layout files, range selection + stats, markers.
- **Plan D:** scatter view, PNG/CSV export, docs, v0.2.0 release.

## 12. Left to the builder

- Exact visual styling within the Instrument tokens.
- Debounce timings beyond those stated.
- Plotly bundle choice, if `plotly.js-gl2d-dist-min` turns out unsuitable, as long as it is lazy-loaded and has `scattergl`.
