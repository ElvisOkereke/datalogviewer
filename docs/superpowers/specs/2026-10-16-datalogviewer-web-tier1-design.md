# DataLogViewer Web — Tier 1 (M0 + M1) Design

**Date:** 2026-10-16
**Status:** Approved 2026-10-17
**Scope:** Milestone 0 (foundation + hosting) and Milestone 1 (Tier 1 "Solid viewer"), released together as **v0.1.0**.

---

## 1. Goal

Rebuild DataLogViewer as a fast, professional, browser-based log viewer: a free alternative to MegaLogViewer. CSV logs are the base input. The app is fully client-side — **log files never leave the user's browser** — and is hosted on GitHub Pages with no servers, keys, or services that need ongoing attention.

### Success criteria for v0.1.0

- Live at `https://elvisokereke.github.io/datalogviewer/`, deployed automatically from `main`.
- Opens real-world CSV exports (including the provided `autodata` sample) correctly: header, units, encoding, time fallback.
- A 1,000,000-row × 20-channel CSV parses without freezing the UI and pans/zooms smoothly.
- All interactions in §7 work with mouse and keyboard; usable read-only on a phone.
- CI is green: lint, typecheck, unit tests, E2E smoke, build.

### Non-goals for Tier 1 (deferred, but designed for)

Calculated channels, scatter/histogram views, range statistics, markers, export, layout files (Tier 2). RPM×MAP tables, log comparison, filters, `.msl`/MLG formats, PWA/offline (Tier 3). Accounts, cloud storage, analytics — never planned.

---

## 2. Context

The existing Flutter prototype (~750 lines) cannot load files on the web (`dart:io` + `PlatformFile.path`), caps files at 250 KB, depends on 2–4-year-old packages, and has data bugs (header row plotted as zeros, incorrect normalization, min/max index errors, hardcoded `data[2][5]`). Its working logic is small enough that a rewrite is cheaper than a port.

**Decisions made during brainstorming**

| Topic | Decision |
|---|---|
| Stack | TypeScript + React + Vite; uPlot for time-series charts; Papa Parse in a Web Worker; Tailwind CSS + shadcn/ui; Zustand for state. Plotly is reserved for Tier 2 scatter/histogram views (lazy-loaded). |
| Hosting | GitHub Pages via GitHub Actions. |
| Repo | Same repo. Tag Flutter code `flutter-prototype`, replace on `main`, rename repo to `datalogviewer`. |
| Layout | "Workbench": channel sidebar left, stacked chart panes, overview strip, optional Inspector panel on the right. |
| Visual style | "Instrument": graphite dark-first, amber accent, Inter + JetBrains Mono. Light theme also provided. |
| License | None for now (default copyright applies). Repo stays public. |

---

## 3. Roadmap

| Milestone | Delivers | Release |
|---|---|---|
| **M0 Foundation** | Project scaffold, lint/format/test tooling, CI, Pages deploy, app shell + theme. Live URL on day one. | part of v0.1.0 |
| **M1 Tier 1** | Everything in this document. | **v0.1.0** |
| **M2 Tier 2** | Calculated channels, scatter (Plotly), range stats, markers, PNG/CSV export, layout files. | v0.2.0 |
| **M3 Tier 3** | RPM×MAP histogram tables, log compare/overlay, filters, `.msl`/MLG readers, PWA. May ship as several releases. | v0.3.0+ |

Each of M2 and M3 gets its own spec → plan → implementation cycle.

---

## 4. Architecture

### 4.1 Module layout

```
src/
  io/          LogReader interface, reader registry, CSV reader (pure functions + worker entry)
  workers/     parse.worker.ts — runs a reader off the main thread
  data/        Log/Channel model, stats, time-axis helpers, channel lookup (no React)
  state/       Zustand stores: logs, view (x-range, cursor), layout (persisted)
  charts/      uPlot React wrapper, cursor/scale sync, overview strip, series palette
  ui/          App shell, toolbar, sidebar, panes, inspector, table, dialogs, toasts
  styles/      Tailwind config, design tokens (CSS variables) for dark/light
public/samples/  demo-run.csv (generated), autodata-sheet2.csv (user-provided)
scripts/       generate-sample.ts (deterministic, seeded)
tests/         unit (Vitest) + e2e (Playwright) + fixtures/
```

Rules: `io/` and `data/` import nothing from React or `ui/`. `charts/` depends on `data/` and `state/` only. Each unit is testable alone.

### 4.2 Data model

```ts
interface Log {
  id: string;
  fileName: string;
  rowCount: number;
  time: Float64Array;                 // seconds from start, or row index
  timeSource: { kind: 'column'; channelId: string; originalUnit: 's' | 'ms' | 'datetime' }
            | { kind: 'index' };
  channels: Channel[];                // file order preserved
  meta: {
    delimiter: string;
    decimal: '.' | ',';
    encoding: 'utf-8' | 'windows-1252';
    preamble: string[];               // skipped lines before the header
    warnings: ParseWarning[];
  };
}

interface Channel {
  id: string;                         // stable within a log
  header: string;                     // exact original header text, e.g. "Calculated MAP (psi)"
  name: string;                       // "Calculated MAP"
  unit?: string;                      // "psi"
  kind: 'numeric' | 'text';           // Tier 2 adds 'calculated'
  values: Float64Array | null;        // numeric: NaN for blank/invalid cells
  text: string[] | null;              // text channels only
  min: number; max: number;           // over finite values; NaN if none
}

interface ParseWarning { code: string; message: string; count?: number; firstRow?: number }
```

- Invalid/blank numeric cells are `NaN`; uPlot renders them as gaps (never as fake zeros).
- The store holds `logs: Record<string, Log>` and `activeLogId` — multi-log from day one (Tier 3 compare), though Tier 1 UI shows one log at a time and opening a new file replaces the active one.

### 4.3 Reader interface (pluggable formats)

```ts
interface LogReader {
  id: string;                         // 'csv'
  extensions: string[];               // ['.csv', '.txt', '.tsv']
  sniff(head: Uint8Array): number;    // confidence 0..1 from the first ~64 KB
  parse(file: File, onProgress: (fraction: number) => void): Promise<Log>;
}
```

The registry picks the highest-confidence reader. Tier 3 adds `.msl` and MLG readers without touching the UI.

### 4.4 Load flow

1. File dropped / chosen / sample requested.
2. Main thread posts the `File` to `parse.worker.ts`.
3. Worker sniffs, selects a reader, streams the file through Papa Parse in chunks, writes values directly into growing typed arrays, and reports progress.
4. Worker posts the finished `Log` back, **transferring** the `ArrayBuffer`s (zero-copy).
5. Store adds the log, re-binds the persisted layout to the new channels (§8), resets the view to the full range.

### 4.5 Charts

- One uPlot instance per pane; all panes share a uPlot `cursor.sync` key so the crosshair moves together, and x-scale changes are broadcast through the view store so zoom/pan stay in lockstep.
- **Per-channel scales by default:** each series gets its own y-scale fitted to its min/max (with 5% padding), so mixed-unit series share a pane legibly. The visible y-axis shows the scale of the legend-hovered series (default: first). A per-pane "shared axis" toggle puts all series on one scale.
- Overview strip: a small uPlot showing the first series of the first pane (or the first numeric channel) across the full log, with a draggable/resizable window bound to the view store.
- No decimation in Tier 1; uPlot handles ~1M points per series. A min/max decimation hook is left in the wrapper for later.

---

## 5. CSV ingestion rules

Implemented as pure functions in `io/csv/` so every rule is unit-tested.

| Concern | Rule |
|---|---|
| Encoding | Strip UTF-8 BOM. Decode as UTF-8 with `fatal: true`; on failure, re-decode as windows-1252. |
| Delimiter | Score `,` `;` `\t` `|` on the first 50 non-empty lines by field-count consistency; highest consistent count wins. |
| Decimal comma | If the delimiter is not `,` and comma-decimal cells (`^-?\d+,\d+$`) outnumber dot-decimal cells, treat `,` as the decimal separator. A consistent `;`/tab/`|` delimiter wins over `,`. |
| Preamble | Determine the modal field count; leading lines with a different count are skipped and kept in `meta.preamble`. |
| Header | First kept row is the header if most of its cells are non-numeric; otherwise headers are `Column 1..N` and that row is data. |
| Units row | If the row after the header is mostly non-numeric and the next is mostly numeric, it is a units row. |
| Units in header | `Name (unit)` or `Name [unit]` → `name`, `unit` (units row wins if both present). `header` keeps the original text. |
| Column kind | Numeric if ≥ 90% of non-blank cells parse as numbers; otherwise text. |
| Time column | Candidate if name matches `/^(time|timestamp|secl?|seconds?|ms|millis(econds)?)$/i` after unit stripping, or unit is `s`/`ms`. Must be non-decreasing. `ms` → divide by 1000. Date-time strings → epoch → seconds from first row. Rebased so the first sample is 0. If none qualifies → row index, with an info notice. |
| Ragged rows | Short rows padded with NaN/empty; long rows truncated. Non-fatal warning with count and first row. Blank lines ignored. |
| Size | Warn (confirm dialog) above 150 MB. The worker decodes the whole file to text, then parses row by row straight into typed arrays (no intermediate row objects). Out-of-memory in the worker is caught and reported. |

**Fixtures:** `tests/fixtures/` holds the user-provided `autodata-sheet2.csv` (header with `(unit)` names, `°` characters, no time column), plus small hand-written files for each rule above (semicolon/decimal-comma, preamble, units row, ms time, datetime time, ragged rows, windows-1252 `°`, no header, text column, empty file, no numeric columns).

---

## 6. UI and visual system

### 6.1 Layout (Workbench)

```
┌ Toolbar: brand · file name · rows · duration ── Chart|Table · Layout ▾ · Inspector · Theme · Open log ┐
├ Sidebar ─────┬ Pane 1 (legend with live values, y-axis, crosshair) ─────────────┬ Inspector (toggle) ┤
│ search       │ Pane 2                                                           │ all channels at    │
│ channel list │ Pane …            (resizable dividers; "drop to add pane" zone)  │ cursor, searchable │
│              ├ Overview strip (full log, draggable window) ─────────────────────┤                    │
└──────────────┴──────────────────────────────────────────────────────────────────┴────────────────────┘
```

Empty state: centered drop zone with "Open log" and "Try a sample log" (demo run + autodata sample).
Below ~900 px: sidebar and inspector become slide-over drawers; toolbar collapses into a menu.

### 6.2 Visual tokens ("Instrument")

Defined as CSS variables on `:root`, switched by `data-theme` and `prefers-color-scheme`.

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0e1013` | `#f7f8fa` |
| `--panel` | `#15181c` | `#ffffff` |
| `--line` | `#252a31` | `#e1e4e8` |
| `--fg` | `#e7ebef` | `#16191d` |
| `--muted` | `#7d8792` | `#5f6873` |
| `--accent` | `#f5a524` | `#c97a00` (darkened for contrast on light) |
| Radius | 5 px | 5 px |

Fonts: Inter (UI), JetBrains Mono with `tabular-nums` (all numeric readouts, axes, table cells). Self-hosted via `@fontsource` packages — no runtime calls to Google Fonts.

Series palette: 8 colours validated for ≥ 3:1 contrast against both `--bg` values and for colour-vision-deficiency distinguishability (validated during implementation with the dataviz skill's validator). Assigned in order; user-overridable per series.

### 6.3 Components (shadcn/ui based)

Toolbar, Sidebar (search + virtualized channel list), PaneStack (react-resizable-panels), ChartPane (uPlot wrapper + legend + pane menu), OverviewStrip, Inspector, DataTable (TanStack Virtual), FileDropZone, ProgressOverlay, Toaster (sonner), AboutDialog (version, repo link, privacy note), ShortcutsDialog (`?`).

---

## 7. Interactions

**Loading:** drop anywhere, Open log button, or sample buttons. Progress overlay during parse. Warnings appear as a dismissible toast with a "details" view.

**Sidebar:** fuzzy search (subsequence match, no dependency). Channels show unit; text channels are greyed and not plottable. Click → add to focused pane (focused pane has an amber left edge). Drag (native HTML5 DnD) → drop onto any pane or the "new pane" zone. Plotted channels show their series colour.

**Pane:** legend lists series with value at cursor; clicking a legend entry opens a menu: remove, colour, scale (auto / manual min-max), make y-axis. Pane menu: shared axis toggle, clear, delete pane. Add pane button below the last pane.

**Navigation**

| Input | Action |
|---|---|
| Wheel | Zoom x around pointer |
| Drag | Pan |
| Shift + drag | Box-zoom to selected x-range |
| Double-click / `F` | Fit full log |
| Overview strip | Drag window, drag its edges, click to centre |
| `←` / `→` (Shift ×10) | Step cursor one sample |
| `Home` / `End` | Cursor to start / end |
| `+` / `-` | Zoom in / out around cursor |
| `?` | Shortcuts dialog |
| Touch | Pinch zoom, one-finger pan, tap sets cursor |

**Cursor:** hover moves the synced crosshair; click pins it (values hold while the pointer leaves); `Esc` unpins. Legends and Inspector read from the cursor index.

**Table view:** Chart/Table toggle in the toolbar. Virtualized rows, sticky header with units, time column first. Cursor row highlighted; clicking a row moves the cursor.

**Theme:** dark / light / system, from the toolbar.

---

## 8. State and persistence

```ts
interface PersistedLayout {
  version: 1;
  panes: { id: string; size: number; sharedAxis: boolean;
           series: { header: string; color: string; scale?: { min?: number; max?: number } }[] }[];
  sidebarWidth: number;
  inspectorOpen: boolean;
  view: 'chart' | 'table';
}
```

The theme preference is stored separately under `dlv.theme` so the pre-paint script in `index.html` can apply it before React loads.

- Stored in `localStorage` under `dlv.layout.v1` via Zustand `persist`; all access wrapped in try/catch — if storage is unavailable the app works without remembering.
- Log data is never persisted.
- **Re-binding on load:** each series is matched to a channel by exact `header`, then by case-insensitive `name`. Unmatched series stay in the layout but render as a struck-through legend entry with "not in this log", so layouts survive switching between loggers.
- Default layout (no saved state): two panes; the first two numeric non-time channels in pane 1, the third in pane 2.
- `version` enables migrations when Tier 2 extends the schema.

---

## 9. Error handling

| Failure | Behaviour |
|---|---|
| Unreadable / empty file | Error card: what happened, what was expected, "Report this file" link (GitHub Issues, pre-filled, no file upload). |
| No numeric columns | Same card, listing detected columns. |
| Non-fatal parse issues | Load succeeds; warning toast with counts and first row numbers. |
| Worker crash / OOM | Caught; error card; app stays usable. |
| Storage unavailable | Silent fallback; layout not remembered. |
| Unexpected render error | React error boundary per pane and at app root with "Reload" and "Report" actions. |

Supported browsers: last two versions of Chrome, Edge, Firefox, Safari.

---

## 10. Testing

- **Unit (Vitest):** every CSV rule in §5 against fixtures; time detection; unit extraction; stats; layout re-binding; fuzzy search. Parser tests run against the pure functions (no worker).
- **Component (Vitest + Testing Library):** sidebar add/remove, legend values for a given cursor index, theme toggle.
- **E2E (Playwright, Chromium):** load demo sample → panes render → hover updates legend values → wheel zoom changes range → switch to table → cursor row highlighted. Load `autodata-sheet2.csv` → units extracted, `°` correct, row-index time notice shown.
- **Performance check:** a generated 250k×20 CSV is parsed in a time-boxed unit test to guard against regressions; 1M×20 parsing and interactive smoothness are verified manually before release.

---

## 11. Build, deploy, repo

- Node 22+ (`.nvmrc`), npm, Vite (`base: '/datalogviewer/'`), strict TypeScript 6.0.x (typescript-eslint supports `<6.1`), ESLint + Prettier.
- Implementation is split into Plan A (foundation + data pipeline, `docs/superpowers/plans/2026-10-17-plan-a-foundation-and-data.md`) and Plan B (Tier 1 UI, written after Plan A lands).
- **CI (`.github/workflows/ci.yml`)** on pull requests and pushes: install → lint → typecheck → unit → build → Playwright smoke.
- **Deploy (`.github/workflows/deploy.yml`)** on push to `main` after CI passes: `actions/upload-pages-artifact` + `actions/deploy-pages`.
- No Dependabot; dependencies are reviewed at the start of each tier.
- Releases: git tags `vX.Y.Z` + `CHANGELOG.md`; version injected at build time and shown in About.
- No analytics/tracking. README states the privacy property.
- Sample generation: `scripts/generate-sample.ts` (seeded PRNG) produces `public/samples/demo-run.csv`: ~8 minutes at 20 Hz (~9,600 rows) with `Time (s)`, `Engine Speed (rpm)`, `MAP (kPa)`, `AFR`, `Accelerator Position (%)`, `Coolant Temperature (°C)`, `Intake Air Temperature (°C)`, `Ignition Advance (°)`, `Battery Voltage (V)`, plus a text `Fuel Mode` channel — physically plausible (RPM/MAP correlated, AFR richens under load).

**Repo migration (done at the start of M0, each outward step confirmed with the user first):**
1. Commit or stash outstanding Flutter changes; tag `flutter-prototype`; push tag.
2. On a branch, remove Flutter files (`lib/`, `android/`, `ios/`, `linux/`, `macos/`, `windows/`, `web/`, `test/`, `pubspec.*`, `analysis_options.yaml`, `.metadata`) and scaffold the new app.
3. Rename GitHub repo to `datalogviewer` (GitHub redirects old URLs); update local remote.
4. Set Pages source to "GitHub Actions".
5. Rewrite `README.md` (free to use; no license file for now).

---

## 12. Hooks for later tiers

| Future feature | Tier 1 provision |
|---|---|
| Calculated channels (T2) | `Channel.kind` union; channels are columns in the same registry, so charts/inspector/table pick them up. |
| Range stats, markers (T2) | Shift-drag selection already produces an x-range in the view store. |
| Layout files (T2) | `PersistedLayout` is versioned, header-keyed JSON — export/import is serialization. |
| Log compare (T3) | `logs` is a map; series refs can gain a `logId`. |
| New formats (T3) | `LogReader` registry. |
| Filters (T3) | Columnar `Float64Array`s allow mask arrays over the same index space. |
| PWA (T3) | Static Vite build; add a service worker plugin. |

---

## 13. Open items

- ~~Confirm the user-provided `autodata` sample may be published~~ — confirmed 2026-10-17.
- ~~License~~ — decided 2026-10-17: no license file for now; repo public.
