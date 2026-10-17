# DataLogViewer Plan C — Tier 2 Analysis Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add calculated channels, layout files, range selection with statistics, and markers on top of v0.1.0.

**Architecture:** Pure modules carry the logic: `src/data/formula/*` (tokenizer, parser, column evaluator), `src/data/calculated.ts` (definitions → channels), `src/data/stats.ts` (range stats), `src/state/markers.ts` (fingerprints), `src/state/layout.ts` (schema v2). Stores gain small actions. Views read a derived "workbench log" (file channels + calculated channels), memoized per (log, definitions). Charts draw the selection band and marker lines in a uPlot `draw` hook.

**Tech Stack:** As v0.1.0. Adds the shadcn `tabs` primitive.

**Spec:** `docs/superpowers/specs/2026-10-17-datalogviewer-tier2-analyst-design.md` (§2, §3, §4, §7, §8, §9). The Tier 1 spec still governs everything it covers.

## Global Constraints

- All Plan A/B Global Constraints still apply (base path, no React in `src/data`/`src/io`/non-tsx `src/charts`, NaN never shown as 0, CSS-variable colours, try/catch around storage, outward actions need confirmation).
- No `eval`, `new Function` or dynamic code in formulas.
- Layout schema `version: 2`, key `dlv.layout.v2`; reads `dlv.layout.v1` once if v2 is absent.
- Limits: formula expression ≤ 2,000 chars; calculated name ≤ 100 chars; pane ids unique; pane sizes finite and > 0.
- Markers key: `dlv.markers.<fingerprint>`.
- Performance: a 1M-row, 3-reference formula evaluates in < 100 ms; range stats for 20 channels × 500k rows in < 60 ms (the spec's 100 × 1M target, scaled to fit test memory).
- `Channel.kind` gains `'calculated'`. Anything that means "plottable" tests `kind !== 'text'`.

## Review Focus

- A calculated channel referencing a channel the next log doesn't have — expected: the definition stays, greyed, with "needs [X]"; plotted series show "not in this log"; nothing crashes. Test in Task 4.
- A formula over a channel with NaN gaps and with `smooth`/`lag`/`rate` at the log edges — expected: NaN at edges/gaps, never 0 or Infinity, and no out-of-bounds reads. Test in Task 3.
- Shift+drag on a pinned cursor, or a selection extending past the visible range — expected: the selection is correct and the band clips to the plot. Test in Task 7.
- Opening the same file again after adding markers, and opening a _different_ file with the same name — expected: markers come back only for the same data. Test in Task 9.
- A layout file from a future version, or a JSON file that isn't a layout — expected: a clear error and no change. Test in Task 6.

## File Map

```
src/data/formula/tokenize.ts   Token, tokenize, FormulaError
src/data/formula/parse.ts      Expr (AST), parseFormula, referencedNames
src/data/formula/evaluate.ts   evaluateFormula, FUNCTIONS
src/data/calculated.ts         CalculatedDef, withCalculated
src/data/stats.ts              (+) rangeStats, sampleSpan
src/state/layout.ts            (v2) types, migrateLayout, selectedPaneId (exists)
src/state/layoutStore.ts       (v2) persistence + calculated/scatter/inspectorTab actions, replaceLayout
src/state/viewStore.ts         (+) selection, select, clearSelection, zoomToSelection
src/state/markers.ts           Marker, logFingerprint, useMarkerStore
src/state/actions.ts           selectRange, addMarkerAtCursor, jumpToMarker
src/charts/overlays.ts         bandRect, drawOverlays (selection band + markers)
src/charts/navigation.ts       Shift+drag → select
src/charts/ChartPane.tsx       draw hook + redraw on selection/markers
src/ui/useWorkbenchLog.ts      memoized workbench log
src/ui/CalculatedEditor.tsx    create/edit dialog
src/ui/Sidebar.tsx             New calculated channel, Calculated group, row menu
src/ui/Inspector.tsx           tabs: Cursor | Range | Markers
src/ui/layoutFile.ts           serializeLayout, parseLayoutFile
src/ui/download.ts             downloadBlob
src/ui/Toolbar.tsx             Layout menu: save/open layout file
src/ui/shortcuts.ts            (+) marker, zoomSelection; unpin → escape
src/ui/ShortcutsDialog.tsx     updated bindings
```

---

### Task 1: Layout schema v2

**Files:** Modify `src/state/layout.ts`, `src/state/layoutStore.ts`, tests `tests/unit/state/layout.test.ts`, `tests/unit/state/layoutStore.test.ts`.

**Interfaces — Produces:**

- `type ViewMode = 'chart' | 'scatter' | 'table'`; `type InspectorTab = 'cursor' | 'range' | 'markers'`
- `interface CalculatedDef { id: string; name: string; unit?: string; expression: string }`
- `interface ScatterConfig { x: string; y: string; color?: string }`
- `PersistedLayout` = spec §8 v2 shape; `EMPTY_LAYOUT` gains `inspectorTab: 'cursor'`, `calculated: []`, `scatter: null`, `version: 2`.
- `migrateLayout(raw)` accepts valid v1 (upgraded) or v2. It rejects (returns `EMPTY_LAYOUT`) on duplicate pane ids, non-finite or ≤ 0 sizes, expression > 2,000 chars, name > 100 chars, or a bad `view`/`inspectorTab`/`scatter` shape.
- Store actions added: `setInspectorTab(tab)`, `addCalculated(def: Omit<CalculatedDef, 'id'>): string`, `updateCalculated(id, patch: Partial<Omit<CalculatedDef, 'id'>>)`, `removeCalculated(id)`, `setScatter(cfg: ScatterConfig | null)`, `replaceLayout(layout: PersistedLayout)`. `setView` accepts `ViewMode`.
- Persistence: name `dlv.layout.v2`, persist `version: 2`, with `migrate` and `merge` both running `migrateLayout`. `safeStorage.getItem('dlv.layout.v2')` falls back to the `dlv.layout.v1` value when v2 is missing.

- [ ] **Tests first** (`layout.test.ts`):
  - a valid v1 object → v2 with `inspectorTab 'cursor'`, `calculated []`, `scatter null`, `view` kept;
  - v2 round-trips;
  - duplicate pane ids → `EMPTY_LAYOUT`;
  - `size: Infinity` → `EMPTY_LAYOUT`;
  - a 2,001-char expression → `EMPTY_LAYOUT`;
  - `view: 'scatter'` is accepted;
  - `scatter: { x: 1 }` → `EMPTY_LAYOUT`.

  (`layoutStore.test.ts`):
  - `addCalculated` returns an id and stores the def;
  - `updateCalculated` patches it;
  - `removeCalculated` drops it;
  - `replaceLayout` swaps everything;
  - with only `dlv.layout.v1` in storage, a fresh `useLayoutStore.persist.rehydrate()` yields the v1 panes as v2;
  - persisted JSON is under `dlv.layout.v2` with `"version":2`.

  Update existing tests' expected `EMPTY_LAYOUT`/version values.

- [ ] Run → FAIL. Implement. Run full suite → PASS. Commit `feat(layout): schema v2 with calculated channels, scatter config and stricter validation`.

---

### Task 2: Formula tokenizer and parser

**Files:** Create `src/data/formula/tokenize.ts`, `src/data/formula/parse.ts`; test `tests/unit/data/formula/parse.test.ts`.

**Interfaces — Produces:**

- `class FormulaError extends Error { readonly pos: number }` — `pos` is a 0-based character index.
- `type Expr = { type: 'num'; value: number; pos } | { type: 'ref'; name: string; pos } | { type: 'time'; pos } | { type: 'unary'; op: '-' | 'not'; arg: Expr; pos } | { type: 'binary'; op: '+'|'-'|'*'|'/'|'^'|'<'|'<='|'>'|'>='|'=='|'!='|'and'|'or'; left: Expr; right: Expr; pos } | { type: 'call'; fn: string; args: Expr[]; pos }`
- `parseFormula(src: string): Expr`
  - `[...]` → ref (an unterminated bracket is an error);
  - bare identifiers: `t` → time, `pi` → num, `and`/`or`/`not` → operators, a name followed by `(` → call, otherwise ref;
  - precedence low→high: `or`, `and`, `not`, comparison (non-associative), `+ -`, `* /`, unary `-`, `^` (right-associative, binds tighter than unary minus).
- `referencedNames(e: Expr): string[]` — unique, in order of appearance.

- [ ] **Tests first:**
  - `1 + 2 * 3` tree shape;
  - `-2 ^ 2` parses as `-(2^2)`;
  - `2 ^ 3 ^ 2` is right-associative;
  - `[MAP (kPa)] / 100 - 1` gives a ref named `MAP (kPa)`;
  - `RPM > 3000 and not [Decel]`;
  - `if(TPS > 90, AFR, 0)` → call with 3 args;
  - `t` → time; `pi` → num 3.14159…;
  - errors with positions: `1 +` → pos 3; `(1` → "Expected ')'" pos 2; `[RPM` → "Unterminated [" pos 0; `1 $ 2` → "Unexpected '$'" pos 2; `1 < 2 < 3` → error;
  - `referencedNames('[A] + B * [A]')` → `['A', 'B']`.
- [ ] Run → FAIL. Implement. PASS. Commit `feat(formula): tokenizer and parser with positioned errors`.

---

### Task 3: Formula evaluator and calculated channels

**Files:** Create `src/data/formula/evaluate.ts`, `src/data/calculated.ts`; modify `src/data/types.ts` (`kind: 'numeric' | 'text' | 'calculated'`), `src/ui/Sidebar.tsx` (plottable = `kind !== 'text'`); tests `tests/unit/data/formula/evaluate.test.ts`, `tests/unit/data/calculated.test.ts`.

**Interfaces:**

- Consumes: `parseFormula`, `referencedNames`, `FormulaError`, `findChannel`, `finiteMinMax`.
- Produces:
  - `interface EvalEnv { rowCount: number; time: Float64Array; resolve(name: string): Float64Array | undefined }`
  - `evaluateFormula(e: Expr, env: EvalEnv): Float64Array` — always length `rowCount`.
    - Every result that isn't finite becomes NaN; division by zero → NaN.
    - Comparisons and logic propagate NaN.
    - `if(c, a, b)`: NaN when `c` is NaN.
    - `delta`: first sample NaN. `rate`: `delta(x) / delta(t)`, NaN when `dt ≤ 0`.
    - `smooth(x, n)`: `n` must be a positive integer literal; centred window of n samples; mean of the finite values; NaN if none.
    - `lag(x, n)`: `n` must be a non-negative integer literal; NaN for the first n samples.
    - Errors: unknown function, wrong number of arguments, non-literal `n`, unknown channel — all `FormulaError` at the node's `pos`.
  - `withCalculated(log: Log, defs: CalculatedDef[]): { log: Log; errors: Record<string, string> }`
    - Evaluates each definition in dependency order (references can name file channels or other definitions, case-insensitive).
    - A cycle → error `"refers to itself"` (direct or indirect) for every definition in the cycle.
    - A missing reference → `"needs [X]"`. A parse or eval error → its message.
    - Successful definitions become channels `{ id: 'calc:' + def.id, header: unit ? \`${name} (${unit})\` : name, name, unit, kind: 'calculated', values, text: null, min, max }`, appended after the file channels.
    - Returns the same `log` object when `defs` is empty.

- [ ] **Tests first:**
  - evaluate: arithmetic broadcasting scalars against columns;
  - `1/0` → NaN; `[A] > 1` with NaN in A → NaN at that row;
  - `if`, `and/or/not`, `abs/min/max/clamp/round/sqrt(-1)→NaN`;
  - `delta` → `[NaN, …]`; `rate` with repeated timestamps → NaN;
  - `smooth([A], 3)` on `[1, 2, NaN, 4]` → `[1.5, 1.5, 3, 4]`;
  - `lag([A], 2)` → `[NaN, NaN, A0, A1]`; `smooth([A], [B])` → FormulaError;
  - `t` gives the log time;
  - **performance:** `[A] * 2 + [B] / [C]` over 1M rows < 100 ms.

  calculated:
  - a def using a file channel appears with kind `'calculated'` and correct min/max;
  - a def using another def works regardless of order;
  - `A = [B] + 1`, `B = [A]` → both errors contain "refers to itself";
  - **Review Focus:** a def needing `[Lambda]` on a log without it → error "needs [Lambda]", no channel, other defs unaffected;
  - an empty defs array returns the identical log object.

- [ ] Run → FAIL. Implement. PASS (full suite). Commit `feat(formula): column evaluator and calculated channels`.

---

### Task 4: Workbench log wiring

**Files:** Create `src/ui/useWorkbenchLog.ts`; modify `src/ui/AppShell.tsx` (Workbench, Toolbar and overview use the workbench log); test `tests/unit/ui/AppShell.test.tsx` additions.

**Interfaces — Produces:** `useWorkbenchLog(): { log: Log | null; calcErrors: Record<string, string> }` — `withCalculated(activeLog, layout.calculated)` memoized on `(activeLog, calculated)`.

- [ ] **Tests first** (AppShell, mocks as before):
  - with `calculated: [{ id: 'k', name: 'Double RPM', expression: '[RPM] * 2' }]` in the layout and a log → the sidebar shows "Double RPM" with an `fx` tag;
  - **Review Focus:** a def needing a missing channel shows greyed with "needs [Lambda]", and the app still renders panes.
- [ ] Implement (the Sidebar part of rendering defs comes in Task 5; for this task render `fx` tag + greyed error rows minimally in Sidebar — Task 5 adds editing). PASS. Commit `feat: views read the workbench log with calculated channels`.

---

### Task 5: Calculated channel editor and sidebar actions

**Files:** Create `src/ui/CalculatedEditor.tsx`; modify `src/ui/Sidebar.tsx`; test `tests/unit/ui/CalculatedEditor.test.tsx`, `tests/unit/ui/Sidebar.test.tsx` additions.

**Interfaces:**

- `CalculatedEditor(props: { open: boolean; onOpenChange(o: boolean): void; log: Log; editing?: CalculatedDef }): JSX.Element`
  - Name, Unit and Expression (monospace textarea) fields, plus an "Insert channel" native `<select>` that inserts `[name]` at the caret.
  - Live validation, debounced 200 ms: parse + evaluate against `log` (with the other defs) → either the error message with "at character N" or "min · max · count values".
  - Save is disabled when the expression is invalid, the name is empty or > 100 chars, or the name duplicates any other channel or definition (case-insensitive).
  - Save calls `addCalculated` or `updateCalculated`.
- Sidebar:
  - a "New calculated channel" button under the search box;
  - a "Calculated" group heading before calculated rows;
  - each calculated row has a menu button `aria-label="Options for {name}"` with Edit and Delete;
  - unavailable definitions are listed greyed in the group with their error as a subtitle.

- [ ] **Tests first:**
  - typing name "Lambda", expression `[AFR] / 14.7`, waiting → preview shows "min"; Save stores the def;
  - expression `[AFR] /` → error with "at character", Save disabled;
  - name "RPM" (an existing channel) → "Name already used", Save disabled;
  - Edit opens prefilled, and saving updates the def;
  - Delete removes it.
- [ ] Implement. PASS. Commit `feat(ui): calculated channel editor with live validation`.

---

### Task 6: Layout files

**Files:** Create `src/ui/layoutFile.ts`, `src/ui/download.ts`; modify `src/ui/Toolbar.tsx`; tests `tests/unit/ui/layoutFile.test.ts`.

**Interfaces:**

- `serializeLayout(l: PersistedLayout): string` — pretty JSON with `app: 'DataLogViewer'`, `kind: 'layout'`.
- `parseLayoutFile(text: string): PersistedLayout | null` — `null` on invalid JSON, a missing `app`/`kind` marker, or `migrateLayout` returning empty for non-empty input.
- `downloadBlob(blob: Blob, fileName: string): void`
- Toolbar Layout menu:
  - "Save layout to file…" downloads `datalogviewer-layout.dlvlayout.json`;
  - "Open layout file…" uses a hidden input (`aria-label="Open layout file"`, accept `.json`). It confirms with an AlertDialog ("Replace your current layout?") before `replaceLayout`; invalid files get a toast error "This isn't a DataLogViewer layout file."

- [ ] **Tests first:**
  - round trip equals the input;
  - **Review Focus:** `{"app":"DataLogViewer","kind":"layout","version":3,…}` → null; `[]` → null; `not json` → null; a valid v1 file → upgraded v2.
- [ ] Implement. PASS. Commit `feat: save and open layout files`.

---

### Task 7: Range selection

**Files:** Create `src/charts/overlays.ts`, `src/state/actions.ts`; modify `src/state/viewStore.ts`, `src/charts/navigation.ts`, `src/charts/ChartPane.tsx`, `src/ui/shortcuts.ts`, `src/ui/useShortcuts.ts`, `src/ui/ShortcutsDialog.tsx`; tests `tests/unit/charts/overlays.test.ts`, viewStore/shortcuts additions, E2E.

**Interfaces:**

- viewStore: `selection: XRange | null`; `select(r: XRange)` (clamped to bounds; a span < minSpan is ignored); `clearSelection()`; `zoomToSelection()` (setRange to the selection). `resetForLog` clears the selection.
- `selectRange(r: XRange)` in `actions.ts`: `select(r)`, then open the Inspector on the Range tab.
- navigation: the `setSelect` handler calls a new `h.select(r)` instead of `h.setRange`.
- `bandRect(sel: XRange, toPx: (v: number) => number, plotLeft: number, plotWidth: number): { left: number; width: number } | null` — clipped to the plot; null if entirely outside.
- `drawOverlays(u: uPlot, sel: XRange | null, markers: { t: number; label: string }[], opts: { accent: string; drawLabels: boolean }): void` — called from a uPlot `draw` hook. The band is the accent colour at 15% alpha. Markers come in Task 9 (the parameter exists now; pass `[]`).
- ChartPane redraws (`u.redraw(false)`) when the selection changes, and sets `data-sel-min`/`data-sel-max` attributes on the pane root for tests.
- shortcuts: `ShortcutAction` gains `{ type: 'zoomSelection' }` (Z/z) and `{ type: 'marker' }` (M/m). `{ type: 'unpin' }` is renamed `{ type: 'escape' }`: first Esc clears the selection if there is one, otherwise unpins.
- ShortcutsDialog: "Shift + drag → Select a range", "Z → Zoom to the selection", "M → Add a marker", "Esc → Clear the selection, then release the cursor".

- [ ] **Tests first:**
  - `bandRect` inside, partly outside (clipped) and fully outside (null);
  - viewStore select/clear/zoomToSelection and reset-on-new-log;
  - shortcut mappings Z, M, Esc;
  - E2E:
    - Shift+drag 25%→50% → panes have `data-sel-min ≈ 120`, `data-sel-max ≈ 240`, and the x-range is unchanged;
    - Z → x-range ≈ the selection;
    - Esc → no `data-sel-min`;
    - **Review Focus:** Shift+drag with a pinned cursor still selects 25%→50%.
  - Update the existing "Shift+drag zooms" E2E tests to the new behaviour (select, then Z).
- [ ] Implement. PASS (unit + E2E). Commit `feat: Shift+drag selects a range; Z zooms to it`.

---

### Task 8: Range statistics and Inspector tabs

**Files:** Modify `src/data/stats.ts`, `src/ui/Inspector.tsx`; add the shadcn `tabs` primitive (`npx shadcn@latest add tabs --yes`, repointing `cn` imports as in Plan B Task 1); tests `tests/unit/data/stats.test.ts` additions, `tests/unit/ui/Inspector.test.tsx` additions.

**Interfaces:**

- `sampleSpan(time: Float64Array, r: XRange): [number, number]` — `[i0, i1)` of the samples with `r.min ≤ t ≤ r.max`.
- `rangeStats(values: Float64Array, i0: number, i1: number): { min: number; max: number; mean: number; std: number; count: number }` — finite values only, population std; NaN fields with count 0 when there are none.
- Inspector:
  - Radix Tabs Cursor | Range | Markers, bound to `layout.inspectorTab`.
  - The Range tab shows "Select a range with Shift+drag" when there's no selection. Otherwise:
    - a header with start, end and duration (`formatTime`);
    - a sample count;
    - rows of name / min / mean / max / std (`formatValue`, `num`), filtered by the shared search;
    - buttons "Zoom to selection" and "Clear".
  - Stats are memoized on `(log, selection)`.

- [ ] **Tests first:**
  - `sampleSpan` on `[0..9]` with `{2.5, 6}` → `[3, 7)`;
  - `rangeStats([1, 2, NaN, 3], 0, 4)` → min 1, max 3, mean 2, std ≈ 0.8165, count 3;
  - an empty range → count 0, NaN fields;
  - **performance:** 20 channels × 500k rows < 60 ms total;
  - Inspector: with a selection, the Range tab shows RPM mean; the tab switch persists `inspectorTab`; with no selection it shows the hint.
- [ ] Implement. PASS. Commit `feat(ui): range statistics in a tabbed Inspector`.

---

### Task 9: Markers

**Files:** Create `src/state/markers.ts`; modify `src/state/actions.ts`, `src/state/logStore.ts` (load markers on activation), `src/charts/ChartPane.tsx`, `src/charts/overlays.ts`, `src/ui/Inspector.tsx` (Markers tab), `src/ui/useShortcuts.ts`, `src/ui/PaneStack.tsx` (pane menu "Add marker"); tests `tests/unit/state/markers.test.ts`, Inspector additions, E2E.

**Interfaces:**

- `interface Marker { id: string; t: number; label: string }`
- `logFingerprint(log: Log): string` — FNV-1a hex of `fileName | rowCount | time[0] | time[n-1] | headers joined`.
- `useMarkerStore` with state `{ key: string | null; markers: Marker[] }` and actions:
  - `load(log: Log)` (reads `dlv.markers.<fp>`, safely);
  - `add(t: number): Marker` (label `Marker N`, where N is one more than the highest existing number);
  - `rename(id, label)`; `remove(id)`.
  - Every change writes storage (try/catch). Markers are kept sorted by `t`.
- `addMarkerAtCursor()` — the cursor's time, else the centre of the view. `jumpToMarker(m)` — `pin(nearestIndex(time, m.t))`; if `m.t` is outside the visible range, `setRange` centred on it with the same span.
- Overlays: dashed accent lines at each marker's t; labels drawn at the top of the first pane only (`drawLabels`).
- Markers tab: an "Add marker" button, then the list (time + label). Clicking a row calls `jumpToMarker`; a rename button turns the label into an `Input` (Enter saves, Esc cancels); a delete button removes it.

- [ ] **Tests first:**
  - fingerprint: same log → same value;
  - **Review Focus:** same name with different data → a different value;
  - store add/rename/remove/sort/persist; `load` restores from storage; throwing storage doesn't break `add`;
  - Inspector Markers tab: add, rename, and a click pins the cursor at the marker;
  - E2E: M adds "Marker 1" (the tab lists it, the pane's `data-markers` count is 1); reload + reopening the demo → the marker is still listed; opening the autodata sample → none.
- [ ] Implement. PASS. Commit `feat: markers with per-log persistence`.

---

### Task 10: Plan C end-to-end coverage and docs

**Files:** `tests/e2e/workbench.spec.ts` (new spec file `tests/e2e/analysis.spec.ts`), `README.md` (feature list + shortcuts line), `CHANGELOG.md` (`## [Unreleased]`).

- [ ] E2E `analysis.spec.ts`:
  - create calculated channel "Lambda" = `[AFR] / 14.7` via the editor, then plot it → the legend shows "Lambda" with a value ≈ AFR/14.7 at the cursor;
  - save the layout to a file (capture the download), reset the layout, open the file → Lambda is back;
  - Shift+drag → the Range tab shows a mean for Engine Speed.
- [ ] Docs updated. Full verification: `npx eslint . && npm run typecheck && npx vitest run && npm run test:e2e`.
- [ ] Commit `test/docs: Tier 2 analysis end-to-end coverage`. Continue with Plan D on the same branch (no release yet).
