# DataLogViewer Plan A — Foundation & Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Flutter prototype with a TypeScript/React/Vite app that is deployed to GitHub Pages and can load any CSV log in a Web Worker into a tested columnar data model, shown on a temporary "load & inspect" screen.

**Architecture:** Pure TypeScript `data/` and `io/` layers (no React) produce a `Log` of `Float64Array` channels; a Web Worker runs the reader and transfers buffers zero-copy to a Zustand store; a minimal React shell renders the Instrument theme. Plan B (written after this lands) builds the real Tier 1 UI — charts, sidebar, inspector, table — on top of these pieces and replaces the temporary inspect screen.

**Tech Stack:** Node 22, npm, Vite 8, React 19, TypeScript 6.0.x (typescript-eslint requires `<6.1`), Tailwind CSS 4, Papa Parse 5, Zustand 5, Vitest 5 + Testing Library + jsdom, Playwright, ESLint 10 + typescript-eslint 8, Prettier 3, tsx.

**Spec:** `docs/superpowers/specs/2026-10-16-datalogviewer-web-tier1-design.md`

## Global Constraints

- Vite `base` is `/datalogviewer/`; the site is served at `https://elvisokereke.github.io/datalogviewer/`.
- `src/io/` and `src/data/` must not import React or anything from `src/ui/`.
- Invalid or blank numeric cells are `NaN`, never `0`.
- Fonts are self-hosted via `@fontsource-variable/*`; no runtime requests to Google Fonts.
- No analytics, tracking, or network calls except fetching bundled sample files.
- No source maps in production builds (`build.sourcemap: false`).
- No `LICENSE` file. README says the app is free to use.
- Theme preference is stored in `localStorage` key `dlv.theme` (`'dark' | 'light' | 'system'`); every storage access is wrapped in try/catch.
- Colours come from CSS variables on `:root` (dark, the default) and `:root[data-theme='light']`; components use Tailwind utilities mapped to those variables, never hex values.
- Outward actions (pushing, renaming the repo, changing Pages settings, merging) require explicit user confirmation at the time they happen.

## Review Focus

- Excel/Sheets exports with trailing empty columns (`a,b,,`) — expected: blank, header-less columns are dropped, not shown as `Column 3`. Test in Task 6.
- Duplicate column headers (`Lambda,Lambda`) — expected: both load with distinct headers `Lambda` and `Lambda #2` so layouts can bind to each. Test in Task 6.
- Quoted cells containing the delimiter (`"ok, fine"`) — expected: one cell, not two; column counts stay consistent. Test in Task 6.
- CRLF line endings and a trailing newline — expected: no phantom empty data row. Test in Task 6.
- A named time column that goes backwards (logger reset) — expected: fall back to row numbers with a clear warning instead of drawing a scribble. Test in Task 6.

## File Map

```
.github/workflows/ci.yml          lint, typecheck, unit, e2e on PRs / non-main pushes / reusable
.github/workflows/deploy.yml      CI then build + deploy to Pages on push to main
.nvmrc  .prettierrc  .prettierignore  .gitignore  eslint.config.js
index.html  package.json  tsconfig.json  vite.config.ts  playwright.config.ts
public/favicon.svg
public/samples/demo-run.csv       generated (Task 9)
public/samples/autodata-sheet2.csv user-provided sample
scripts/demoLog.ts                pure generator: generateDemoLog(): string
scripts/generate-sample.ts        CLI: writes public/samples/demo-run.csv
src/main.tsx  src/App.tsx  src/index.css  src/globals.d.ts
src/data/types.ts                 Log, Channel, TimeSource, ParseWarning
src/data/errors.ts                LogParseError, LogErrorCode
src/data/stats.ts                 finiteMinMax
src/data/channels.ts              splitHeaderUnit, findChannel
src/data/search.ts                fuzzyScore, filterByQuery
src/data/growable.ts              GrowableF64
src/io/types.ts                   LogReader
src/io/registry.ts                READERS, readLog
src/io/csv/decode.ts              decodeBytes
src/io/csv/number.ts              parseNumber
src/io/csv/sniff.ts               splitLine, modalFieldCount, detectDelimiter, detectDecimalComma, findHeaderIndex, numericFraction
src/io/csv/time.ts                isTimeChannel, isMillisChannel, parseClockOrDate, isNonDecreasing, toRelativeSeconds, pickTime
src/io/csv/parseCsv.ts            firstLines, sniffLayout, parseCsvText
src/io/csv/reader.ts              csvReader
src/workers/protocol.ts           WorkerRequest/Response, transferablesOf, toErrorResponse
src/workers/parse.worker.ts       worker entry
src/workers/parseClient.ts        parseFileInWorker
src/state/logStore.ts             createLogStore, useLogStore, selectActiveLog, SAMPLES, LARGE_FILE_BYTES
src/ui/theme.ts  src/ui/useTheme.ts
src/ui/LoadScreen.tsx             TEMPORARY (replaced in Plan B)
tests/unit/setup.ts  tests/unit/**.test.ts(x)
tests/e2e/*.spec.ts
tests/fixtures/autodata-sheet2.csv
```

---

### Task 1: Preserve the Flutter prototype and start the rebuild branch

**Files:**
- Commit (main): `lib/csv_line_chart.dart`, `lib/main.dart`, `pubspec.yaml`, `pubspec.lock`
- Delete (branch): `lib/`, `android/`, `ios/`, `linux/`, `macos/`, `windows/`, `web/`, `test/`, `pubspec.yaml`, `pubspec.lock`, `analysis_options.yaml`, `.metadata`, `.prettierignore` (untracked; contains only `**`, which would make Prettier ignore everything)

**Interfaces:** none.

- [ ] **Step 1: Commit the outstanding Flutter work on main so nothing is lost**

```bash
git add lib/csv_line_chart.dart lib/main.dart pubspec.yaml pubspec.lock
git commit -m "flutter: range slider WIP (final prototype state)"
```

- [ ] **Step 2: Tag it (local only — pushing happens in Task 11)**

```bash
git tag -a flutter-prototype -m "Final state of the Flutter prototype before the web rebuild"
git tag -l flutter-prototype
```
Expected: `flutter-prototype`

- [ ] **Step 3: Create the branch and remove Flutter files**

```bash
git switch -c web-rebuild
git rm -r -q lib android ios linux macos windows web test pubspec.yaml pubspec.lock analysis_options.yaml .metadata
rm -f .prettierignore
git status --short | head
```
Expected: only `D` lines plus untracked `docs/` and modified `.gitignore`.

- [ ] **Step 4: Replace `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
playwright-report/
test-results/
*.local
.DS_Store
.idea/
.superpowers/
```

- [ ] **Step 5: Commit**

```bash
git add -A .gitignore docs
git commit -m "chore: remove Flutter prototype, add web rebuild spec and plan"
```

---

### Task 2: Scaffold the Vite + React + TypeScript app with the Instrument theme

**Files:**
- Create: `package.json`, `.nvmrc`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `index.html`, `public/favicon.svg`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/globals.d.ts`, `src/ui/theme.ts`, `src/ui/useTheme.ts`
- Test: `tests/unit/setup.ts`, `tests/unit/ui/theme.test.ts`, `tests/unit/App.test.tsx`

**Interfaces:**
- Produces: `type ThemePref = 'dark' | 'light' | 'system'`; `THEME_KEY = 'dlv.theme'`; `readThemePref(): ThemePref`; `resolveTheme(pref: ThemePref, systemDark: boolean): 'dark' | 'light'`; `applyTheme(pref: ThemePref): void`; `useTheme(): { pref: ThemePref; cycle: () => void }`; `App` component; global `__APP_VERSION__: string`; path alias `@/` → `src/`.

- [ ] **Step 1: Create `package.json` (scripts only; dependencies are added by npm in Step 2)**

```json
{
  "name": "datalogviewer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "sample": "tsx scripts/generate-sample.ts"
  }
}
```

And `.nvmrc`:
```
22
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react@^19.3.1 react-dom@^19.3.1 papaparse@^5.7.0 zustand@^5.0.15 @fontsource-variable/inter@^5.3.0 @fontsource-variable/jetbrains-mono@^5.3.0
npm install -D vite@^8.3.4 @vitejs/plugin-react@^6.1.2 typescript@~6.0.3 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 @types/react @types/react-dom @types/papaparse @types/node@^22 vitest@^5.0.5 jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom eslint@^10 @eslint/js@^10 typescript-eslint@^8.71.2 eslint-plugin-react-hooks@^7.1.1 globals prettier@^3.9.10 @playwright/test@^1.64.1 tsx@^4.23.15
```
Expected: both complete without peer-dependency errors.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["vite/client", "node"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "tests", "scripts", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  base: '/datalogviewer/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
```

- [ ] **Step 5: Create lint/format config**

`eslint.config.js`:
```js
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', '.superpowers'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
```

`.prettierrc`:
```json
{ "singleQuote": true, "printWidth": 100 }
```

`.prettierignore`:
```
dist
coverage
playwright-report
test-results
package-lock.json
public/samples
tests/fixtures
.superpowers
```

- [ ] **Step 6: Write the failing tests**

`tests/unit/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

// jsdom has no matchMedia; default to a dark system preference.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});
```

`tests/unit/ui/theme.test.ts`:
```ts
import { beforeEach, describe, expect, test } from 'vitest';
import { applyTheme, readThemePref, resolveTheme, THEME_KEY } from '@/ui/theme';

describe('theme', () => {
  beforeEach(() => localStorage.clear());

  test('system preference follows the OS', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  test('defaults to system and ignores junk values', () => {
    expect(readThemePref()).toBe('system');
    localStorage.setItem(THEME_KEY, 'purple');
    expect(readThemePref()).toBe('system');
  });

  test('applyTheme sets data-theme and remembers the choice', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
});
```

`tests/unit/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from '@/App';

test('renders the brand in the banner', () => {
  render(<App />);
  expect(screen.getByRole('banner')).toHaveTextContent('DataLogViewer');
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run`
Expected: FAIL — cannot resolve `@/ui/theme` and `@/App`.

- [ ] **Step 8: Implement theme helpers**

`src/ui/theme.ts`:
```ts
export type ThemePref = 'dark' | 'light' | 'system';

export const THEME_KEY = 'dlv.theme';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'dark' | 'light' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

export function applyTheme(pref: ThemePref): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = resolveTheme(pref, systemDark);
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked (private window): the theme still applies for this visit.
  }
}
```

`src/ui/useTheme.ts`:
```ts
import { useEffect, useState } from 'react';
import { applyTheme, readThemePref, type ThemePref } from './theme';

const NEXT: Record<ThemePref, ThemePref> = { system: 'dark', dark: 'light', light: 'system' };

export function useTheme(): { pref: ThemePref; cycle: () => void } {
  const [pref, setPref] = useState<ThemePref>(readThemePref);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  return { pref, cycle: () => setPref((p) => NEXT[p]) };
}
```

- [ ] **Step 9: Implement the shell**

`src/globals.d.ts`:
```ts
declare const __APP_VERSION__: string;
```

`src/App.tsx`:
```tsx
import { useTheme } from '@/ui/useTheme';

export function App() {
  const { pref, cycle } = useTheme();
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="size-3.5 rounded-sm bg-primary" aria-hidden />
          DataLogViewer
        </span>
        <span className="num text-xs text-muted-foreground">v{__APP_VERSION__}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={cycle}
          className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
        >
          Theme: {pref}
        </button>
      </header>
      <main className="grid flex-1 place-items-center text-muted-foreground">
        Drop a CSV log to begin.
      </main>
    </div>
  );
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/index.css` (token names follow shadcn/ui conventions so Plan B's components drop in unchanged):
```css
@import 'tailwindcss';
@import '@fontsource-variable/inter';
@import '@fontsource-variable/jetbrains-mono';

@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));

/* Instrument theme — dark is the default. */
:root {
  color-scheme: dark;
  --background: #0e1013;
  --foreground: #e7ebef;
  --panel: #15181c;
  --card: #15181c;
  --card-foreground: #e7ebef;
  --popover: #1c2026;
  --popover-foreground: #e7ebef;
  --primary: #f5a524;
  --primary-foreground: #111316;
  --secondary: #1c2026;
  --secondary-foreground: #e7ebef;
  --muted: #1c2026;
  --muted-foreground: #7d8792;
  --accent: #1f242b;
  --accent-foreground: #e7ebef;
  --destructive: #ff5d5d;
  --border: #252a31;
  --input: #252a31;
  --ring: #f5a524;
  --radius: 5px;
}

:root[data-theme='light'] {
  color-scheme: light;
  --background: #f7f8fa;
  --foreground: #16191d;
  --panel: #ffffff;
  --card: #ffffff;
  --card-foreground: #16191d;
  --popover: #ffffff;
  --popover-foreground: #16191d;
  --primary: #c97a00;
  --primary-foreground: #16191d;
  --secondary: #eef0f3;
  --secondary-foreground: #16191d;
  --muted: #eef0f3;
  --muted-foreground: #5f6873;
  --accent: #e9edf2;
  --accent-foreground: #16191d;
  --destructive: #d42a2a;
  --border: #e1e4e8;
  --input: #d5d9de;
  --ring: #c97a00;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-panel: var(--panel);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, monospace;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background font-sans text-foreground antialiased;
  }
}

@utility num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

`index.html` (the inline script sets the theme before first paint to avoid a flash):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Free, fast datalog viewer for CSV logs. Your files never leave your browser."
    />
    <title>DataLogViewer</title>
    <script>
      try {
        var p = localStorage.getItem('dlv.theme');
        var dark = p === 'dark' || (p !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      } catch (e) {
        document.documentElement.dataset.theme = 'dark';
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#15181c"/><polyline points="5,22 11,14 16,18 21,8 27,12" fill="none" stroke="#f5a524" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

- [ ] **Step 10: Run tests, typecheck, lint, build**

Run: `npx vitest run && npm run typecheck && npm run lint && npm run build`
Expected: 4 tests PASS; typecheck/lint clean; `dist/index.html` references `/datalogviewer/assets/...`.

- [ ] **Step 11: Format and commit**

```bash
npx prettier --write .
git add -A
git commit -m "feat: scaffold Vite + React + TS app with Instrument theme"
```

---

### Task 3: CI, Pages deployment and the Playwright smoke test

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm run build`, `npm run preview`, the `<header>` banner from Task 2.
- Produces: `npm run test:e2e` serving the production build at `http://localhost:4173/datalogviewer/`.

- [ ] **Step 1: Write the failing E2E test**

`tests/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('app shell loads under the Pages base path', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('DataLogViewer');
  await expect(page.getByRole('banner')).toContainText('DataLogViewer');
});
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:4173/datalogviewer/';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

- [ ] **Step 3: Install the browser and run**

Run: `npx playwright install chromium && npm run test:e2e`
Expected: 1 passed.

- [ ] **Step 4: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore: [main]
  workflow_call:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 5: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  ci:
    uses: ./.github/workflows/ci.yml

  build:
    needs: ci
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 6: Commit**

```bash
npx prettier --write .
git add -A
git commit -m "ci: add CI, GitHub Pages deploy and Playwright smoke test"
```

---

### Task 4: Data model and pure helpers

**Files:**
- Create: `src/data/types.ts`, `src/data/errors.ts`, `src/data/stats.ts`, `src/data/channels.ts`, `src/data/search.ts`, `src/data/growable.ts`
- Test: `tests/unit/data/stats.test.ts`, `tests/unit/data/channels.test.ts`, `tests/unit/data/search.test.ts`, `tests/unit/data/growable.test.ts`

**Interfaces:**
- Produces (exact):
  - `interface Log`, `interface Channel`, `type TimeSource`, `interface ParseWarning` (code below)
  - `type LogErrorCode = 'empty' | 'no-numeric-columns' | 'unsupported' | 'out-of-memory' | 'internal'`; `class LogParseError extends Error { code: LogErrorCode }`
  - `finiteMinMax(values: ArrayLike<number>): { min: number; max: number }` — NaN/NaN when no finite values
  - `splitHeaderUnit(header: string): { name: string; unit?: string }`
  - `findChannel(log: Log, header: string): Channel | undefined` — exact header, then case-insensitive name
  - `fuzzyScore(query: string, text: string): number | null`; `filterByQuery<T>(items: T[], query: string, text: (item: T) => string): T[]`
  - `class GrowableF64 { length: number; push(v: number): void; toArray(): Float64Array }`

- [ ] **Step 1: Write the types (no test — compile-checked by later tasks)**

`src/data/types.ts`:
```ts
export type TimeSource =
  | { kind: 'column'; channelId: string; originalUnit: 's' | 'ms' | 'datetime' }
  | { kind: 'index' };

export interface ParseWarning {
  code: string;
  message: string;
  count?: number;
  firstRow?: number;
}

export interface Channel {
  /** Stable within a log. */
  id: string;
  /** Exact header text (de-duplicated), e.g. "Calculated MAP (psi)". Layouts bind by this. */
  header: string;
  name: string;
  unit?: string;
  kind: 'numeric' | 'text';
  /** Numeric channels: one value per row, NaN for blank/invalid cells. */
  values: Float64Array | null;
  /** Text channels only. */
  text: string[] | null;
  /** Over finite values; NaN when there are none. */
  min: number;
  max: number;
}

export interface Log {
  id: string;
  fileName: string;
  rowCount: number;
  /** Seconds from the first sample, or the row index when timeSource is 'index'. */
  time: Float64Array;
  timeSource: TimeSource;
  channels: Channel[];
  meta: {
    delimiter: string;
    decimal: '.' | ',';
    encoding: 'utf-8' | 'windows-1252';
    preamble: string[];
    warnings: ParseWarning[];
  };
}
```

`src/data/errors.ts`:
```ts
export type LogErrorCode = 'empty' | 'no-numeric-columns' | 'unsupported' | 'out-of-memory' | 'internal';

export class LogParseError extends Error {
  readonly code: LogErrorCode;

  constructor(code: LogErrorCode, message: string) {
    super(message);
    this.name = 'LogParseError';
    this.code = code;
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/data/stats.test.ts`:
```ts
import { expect, test } from 'vitest';
import { finiteMinMax } from '@/data/stats';

test('ignores NaN and infinities', () => {
  expect(finiteMinMax(Float64Array.of(NaN, 3, -2, Infinity, 7))).toEqual({ min: -2, max: 7 });
});

test('returns NaN bounds when nothing is finite', () => {
  const r = finiteMinMax(Float64Array.of(NaN, NaN));
  expect(r.min).toBeNaN();
  expect(r.max).toBeNaN();
});
```

`tests/unit/data/channels.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { findChannel, splitHeaderUnit } from '@/data/channels';
import type { Channel, Log } from '@/data/types';

describe('splitHeaderUnit', () => {
  test.each([
    ['Calculated MAP (psi)', 'Calculated MAP', 'psi'],
    ['Accelerator Position (°TPS)', 'Accelerator Position', '°TPS'],
    ['Engine Load (mg/stroke)', 'Engine Load', 'mg/stroke'],
    ['MAP [kPa]', 'MAP', 'kPa'],
    ['  Time (s)  ', 'Time', 's'],
  ])('%s', (header, name, unit) => {
    expect(splitHeaderUnit(header)).toEqual({ name, unit });
  });

  test('leaves headers without a trailing unit alone', () => {
    expect(splitHeaderUnit('AFR')).toEqual({ name: 'AFR' });
    expect(splitHeaderUnit('Gear (est) ratio')).toEqual({ name: 'Gear (est) ratio' });
    expect(splitHeaderUnit('Lambda #2')).toEqual({ name: 'Lambda #2' });
    expect(splitHeaderUnit('Odd ()')).toEqual({ name: 'Odd ()' });
  });
});

describe('findChannel', () => {
  const ch = (header: string, name: string): Channel => ({
    id: header, header, name, kind: 'numeric', values: null, text: null, min: NaN, max: NaN,
  });
  const log = { channels: [ch('MAP (kPa)', 'MAP'), ch('RPM', 'RPM')] } as Log;

  test('matches the exact header first', () => {
    expect(findChannel(log, 'MAP (kPa)')?.id).toBe('MAP (kPa)');
  });

  test('falls back to a case-insensitive name match', () => {
    expect(findChannel(log, 'map (psi)')?.id).toBe('MAP (kPa)');
    expect(findChannel(log, 'rpm')?.id).toBe('RPM');
  });

  test('returns undefined when absent', () => {
    expect(findChannel(log, 'AFR')).toBeUndefined();
  });
});
```

`tests/unit/data/search.test.ts`:
```ts
import { expect, test } from 'vitest';
import { filterByQuery, fuzzyScore } from '@/data/search';

test('empty query matches everything', () => {
  expect(fuzzyScore('', 'RPM')).toBe(0);
});

test('substring beats subsequence; earlier substring beats later', () => {
  const sub = fuzzyScore('map', 'Calculated MAP')!;
  const early = fuzzyScore('map', 'MAP (kPa)')!;
  const seq = fuzzyScore('cmp', 'Calculated MAP')!;
  expect(early).toBeGreaterThan(sub);
  expect(sub).toBeGreaterThan(seq);
});

test('returns null when letters are missing or out of order', () => {
  expect(fuzzyScore('xyz', 'RPM')).toBeNull();
  expect(fuzzyScore('mpr', 'RPM')).toBeNull();
});

test('filterByQuery drops non-matches and sorts by score', () => {
  const items = ['Coolant Temperature', 'Calculated MAP', 'MAP (kPa)', 'RPM'];
  expect(filterByQuery(items, 'map', (s) => s)).toEqual(['MAP (kPa)', 'Calculated MAP']);
  expect(filterByQuery(items, '', (s) => s)).toEqual(items);
});
```

`tests/unit/data/growable.test.ts`:
```ts
import { expect, test } from 'vitest';
import { GrowableF64 } from '@/data/growable';

test('grows past its initial capacity and trims on toArray', () => {
  const g = new GrowableF64();
  for (let i = 0; i < 5000; i++) g.push(i);
  const a = g.toArray();
  expect(a.length).toBe(5000);
  expect(a[4999]).toBe(4999);
  expect(a.buffer.byteLength).toBe(5000 * 8);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/data`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/data/stats.ts`:
```ts
export function finiteMinMax(values: ArrayLike<number>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min <= max ? { min, max } : { min: NaN, max: NaN };
}
```

`src/data/channels.ts`:
```ts
import type { Channel, Log } from './types';

const TRAILING_UNIT = /^(.*?)\s*[([]\s*([^()[\]]+?)\s*[)\]]$/;

/** "MAP (kPa)" / "MAP [kPa]" → { name: "MAP", unit: "kPa" }. */
export function splitHeaderUnit(header: string): { name: string; unit?: string } {
  const trimmed = header.trim();
  const m = TRAILING_UNIT.exec(trimmed);
  if (m && m[1]) return { name: m[1], unit: m[2] };
  return { name: trimmed };
}

/** Re-binds a saved series to a channel: exact header first, then case-insensitive name. */
export function findChannel(log: Log, header: string): Channel | undefined {
  const exact = log.channels.find((c) => c.header === header);
  if (exact) return exact;
  const name = splitHeaderUnit(header).name.toLowerCase();
  return log.channels.find((c) => c.name.toLowerCase() === name);
}
```

`src/data/search.ts`:
```ts
/**
 * Scores how well `text` matches `query`: substring matches score highest (earlier is better),
 * then in-order subsequence matches (consecutive letters and word starts score more).
 * Returns null when the query letters don't all appear in order.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();

  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at;

  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, from);
    if (found < 0) return null;
    score += found === prev + 1 ? 5 : 1;
    if (found === 0 || t[found - 1] === ' ') score += 3;
    prev = found;
    from = found + 1;
  }
  return score;
}

export function filterByQuery<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!query.trim()) return items;
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, text(item)) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
```

`src/data/growable.ts`:
```ts
/** Append-only Float64Array that doubles its capacity as needed. */
export class GrowableF64 {
  private buf = new Float64Array(1024);
  length = 0;

  push(v: number): void {
    if (this.length === this.buf.length) {
      const next = new Float64Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.length++] = v;
  }

  /** Exact-length copy, so its buffer can be transferred without dragging spare capacity along. */
  toArray(): Float64Array {
    return this.buf.slice(0, this.length);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/data`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src tests
git add -A
git commit -m "feat(data): log model, errors, stats, header units, fuzzy search"
```

---

### Task 5: CSV primitives — decoding, numbers, sniffing

**Files:**
- Create: `src/io/csv/decode.ts`, `src/io/csv/number.ts`, `src/io/csv/sniff.ts`
- Test: `tests/unit/io/decode.test.ts`, `tests/unit/io/number.test.ts`, `tests/unit/io/sniff.test.ts`

**Interfaces:**
- Produces (exact):
  - `type TextEncodingName = 'utf-8' | 'windows-1252'`; `decodeBytes(bytes: Uint8Array): { text: string; encoding: TextEncodingName }`
  - `parseNumber(cell: string, decimal: '.' | ','): number` — NaN for blank/non-numeric
  - `DELIMITERS`, `type Delimiter = ',' | ';' | '\t' | '|'`
  - `splitLine(line: string, delimiter: string): string[]` (quote-aware)
  - `modalFieldCount(lines: string[], delimiter: string): { count: number; lines: number }`
  - `detectDelimiter(lines: string[]): Delimiter`
  - `detectDecimalComma(rows: string[][], delimiter: Delimiter): boolean`
  - `findHeaderIndex(lines: string[], delimiter: string): number`
  - `numericFraction(cells: string[], decimal: '.' | ','): number` — over non-blank cells; 0 when all blank

- [ ] **Step 1: Write the failing tests**

`tests/unit/io/decode.test.ts`:
```ts
// @vitest-environment node
import { expect, test } from 'vitest';
import { decodeBytes } from '@/io/csv/decode';

test('decodes UTF-8 and strips a BOM', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Temp (°C)\n1')]);
  expect(decodeBytes(bytes)).toEqual({ text: 'Temp (°C)\n1', encoding: 'utf-8' });
});

test('falls back to windows-1252 when the bytes are not valid UTF-8', () => {
  // "Temp (°C)" with ° as the single windows-1252 byte 0xB0
  const bytes = new Uint8Array([...new TextEncoder().encode('Temp ('), 0xb0, ...new TextEncoder().encode('C)\n1')]);
  expect(decodeBytes(bytes)).toEqual({ text: 'Temp (°C)\n1', encoding: 'windows-1252' });
});
```

`tests/unit/io/number.test.ts`:
```ts
import { expect, test } from 'vitest';
import { parseNumber } from '@/io/csv/number';

test.each([
  ['12.5', '.', 12.5],
  [' -3 ', '.', -3],
  ['1e3', '.', 1000],
  ['.5', '.', 0.5],
  ['12,5', ',', 12.5],
  ['812', ',', 812],
] as const)('%s with %s decimal → %d', (cell, decimal, expected) => {
  expect(parseNumber(cell, decimal)).toBe(expected);
});

test.each(['', '   ', 'abc', '12abc', 'Closed Loop', '1,234', 'Infinity'])('%j is NaN', (cell) => {
  expect(parseNumber(cell, '.')).toBeNaN();
});
```

`tests/unit/io/sniff.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import {
  detectDecimalComma,
  detectDelimiter,
  findHeaderIndex,
  modalFieldCount,
  numericFraction,
  splitLine,
} from '@/io/csv/sniff';

describe('splitLine', () => {
  test('honours quotes and escaped quotes', () => {
    expect(splitLine('1,"ok, fine","say ""hi"""', ',')).toEqual(['1', 'ok, fine', 'say "hi"']);
  });
  test('keeps empty trailing fields', () => {
    expect(splitLine('a,b,,', ',')).toEqual(['a', 'b', '', '']);
  });
});

test('modalFieldCount finds the most common count', () => {
  expect(modalFieldCount(['a,b,c', '1,2,3', 'x'], ',')).toEqual({ count: 3, lines: 2 });
});

describe('detectDelimiter', () => {
  test('comma', () => expect(detectDelimiter(['a,b,c', '1,2,3', '4,5,6'])).toBe(','));
  test('tab', () => expect(detectDelimiter(['a\tb', '1\t2'])).toBe('\t'));
  test('pipe', () => expect(detectDelimiter(['a|b', '1|2'])).toBe('|'));
  test('semicolon with decimal commas, no header', () => {
    // Commas split every line into 3 fields too — semicolon must still win.
    expect(detectDelimiter(['0,05;812,3', '0,10;815,0', '0,15;820,9'])).toBe(';');
  });
  test('defaults to comma for a single column', () => {
    expect(detectDelimiter(['RPM', '800', '900'])).toBe(',');
  });
});

describe('detectDecimalComma', () => {
  test('true when comma decimals dominate a non-comma file', () => {
    expect(detectDecimalComma([['0,05', '812,3'], ['0,10', '815']], ';')).toBe(true);
  });
  test('false for dot decimals', () => {
    expect(detectDecimalComma([['0.05', '812.3']], ';')).toBe(false);
  });
  test('never for comma-delimited files', () => {
    expect(detectDecimalComma([['0,05']], ',')).toBe(false);
  });
});

describe('findHeaderIndex', () => {
  test('skips preamble lines with a different field count', () => {
    expect(findHeaderIndex(['Capture Date: 2026-10-01', 'Logger: X', 'Time;RPM', '0;800'], ';')).toBe(2);
  });
  test('skips mostly-blank preamble lines that happen to have the right count', () => {
    expect(findHeaderIndex(['Exported,,', 'Time,RPM,AFR', '0,800,14.7'], ',')).toBe(1);
  });
  test('0 when there is no preamble', () => {
    expect(findHeaderIndex(['a,b', '1,2'], ',')).toBe(0);
  });
});

test('numericFraction ignores blanks', () => {
  expect(numericFraction(['1', '', 'x', '2.5'], '.')).toBeCloseTo(2 / 3);
  expect(numericFraction(['', ' '], '.')).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/io`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/io/csv/decode.ts`:
```ts
export type TextEncodingName = 'utf-8' | 'windows-1252';

/** UTF-8 (BOM stripped) when valid, otherwise windows-1252 — the usual encoding of older Windows exports. */
export function decodeBytes(bytes: Uint8Array): { text: string; encoding: TextEncodingName } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}
```
(`TextDecoder` strips a UTF-8 BOM by default.)

`src/io/csv/number.ts`:
```ts
/** Parses a CSV cell as a finite number; NaN for blank or non-numeric cells. */
export function parseNumber(cell: string, decimal: '.' | ','): number {
  let s = cell.trim();
  if (s === '') return NaN;
  if (decimal === ',') s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
```

`src/io/csv/sniff.ts`:
```ts
import { parseNumber } from './number';

export const DELIMITERS = [',', ';', '\t', '|'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

const SAMPLE_LINES = 50;
const CONSISTENT = 0.8;

/** Quote-aware split of one line. Only used for sniffing; full parsing uses Papa Parse. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = false;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function modalFieldCount(lines: string[], delimiter: string): { count: number; lines: number } {
  const freq = new Map<number, number>();
  for (const line of lines) {
    const n = splitLine(line, delimiter).length;
    freq.set(n, (freq.get(n) ?? 0) + 1);
  }
  let best = { count: 1, lines: 0 };
  for (const [count, n] of freq) {
    if (n > best.lines || (n === best.lines && count > best.count)) best = { count, lines: n };
  }
  return best;
}

export function detectDelimiter(lines: string[]): Delimiter {
  const sample = lines.slice(0, SAMPLE_LINES);
  if (sample.length === 0) return ',';
  const scored = DELIMITERS.map((d) => {
    const m = modalFieldCount(sample, d);
    return { d, count: m.count, score: m.count >= 2 ? m.lines / sample.length : 0 };
  });
  // Semicolons, tabs and pipes rarely appear by accident, while commas double as decimal
  // separators — so a consistent non-comma delimiter wins over a consistent comma.
  const consistent = scored.filter((s) => s.score >= CONSISTENT);
  const nonComma = consistent.filter((s) => s.d !== ',');
  const pool = nonComma.length ? nonComma : consistent.length ? consistent : scored;
  pool.sort((a, b) => b.score - a.score || b.count - a.count);
  return pool[0].score > 0 ? pool[0].d : ',';
}

const COMMA_DECIMAL = /^[+-]?\d+,\d+$/;
const DOT_DECIMAL = /^[+-]?\d+\.\d+$/;

export function detectDecimalComma(rows: string[][], delimiter: Delimiter): boolean {
  if (delimiter === ',') return false;
  let comma = 0;
  let dot = 0;
  for (const row of rows) {
    for (const cell of row) {
      const c = cell.trim();
      if (COMMA_DECIMAL.test(c)) comma++;
      else if (DOT_DECIMAL.test(c)) dot++;
    }
  }
  return comma > dot;
}

/** First line with the file's usual field count and mostly non-blank cells; earlier lines are a preamble. */
export function findHeaderIndex(lines: string[], delimiter: string): number {
  const { count } = modalFieldCount(lines, delimiter);
  const i = lines.findIndex((line) => {
    const cells = splitLine(line, delimiter);
    const filled = cells.filter((c) => c.trim() !== '').length;
    return cells.length === count && filled * 2 >= count;
  });
  return i < 0 ? 0 : i;
}

export function numericFraction(cells: string[], decimal: '.' | ','): number {
  let nonBlank = 0;
  let numeric = 0;
  for (const c of cells) {
    if (c.trim() === '') continue;
    nonBlank++;
    if (!Number.isNaN(parseNumber(c, decimal))) numeric++;
  }
  return nonBlank === 0 ? 0 : numeric / nonBlank;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/io`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src tests
git add -A
git commit -m "feat(io): CSV decoding, number parsing and layout sniffing"
```

---

### Task 6: CSV parser — `parseCsvText`

**Files:**
- Create: `src/io/csv/time.ts`, `src/io/csv/parseCsv.ts`, `tests/fixtures/autodata-sheet2.csv` (exact copy of the user's "dummy autodata - Sheet2 (4).csv": header `Accelerator Position (°TPS),Calculated MAP (psi),Coolant Temperature (°C),Engine Load (mg/stroke),Filtered Load (mg/stroke),Intake Air Temperature (°C)` followed by its data rows, UTF-8)
- Test: `tests/unit/io/time.test.ts`, `tests/unit/io/parseCsv.test.ts`, `tests/unit/io/parseCsv.perf.test.ts`

**Interfaces:**
- Consumes: Task 4 (`Log`, `Channel`, `ParseWarning`, `TimeSource`, `LogParseError`, `finiteMinMax`, `splitHeaderUnit`, `GrowableF64`), Task 5 (all of `sniff.ts`, `parseNumber`, `TextEncodingName`).
- Produces (exact):
  - `isTimeChannel(name: string, unit?: string): boolean`; `isMillisChannel(name: string, unit?: string): boolean`
  - `parseClockOrDate(cell: string): number` — seconds; NaN if not a clock time / date-time
  - `isNonDecreasing(values: Float64Array): boolean`; `toRelativeSeconds(values: Float64Array, scale: number): Float64Array`
  - `pickTime(channels: Channel[], datetimeIds: Set<string>, rowCount: number): { time: Float64Array; timeSource: TimeSource; warning?: ParseWarning }`
  - `interface CsvParseOptions { fileName: string; encoding: TextEncodingName; onProgress?: (fraction: number) => void }`
  - `parseCsvText(text: string, opts: CsvParseOptions): Log` — throws `LogParseError('empty' | 'no-numeric-columns')`
  - Warning codes: `short-rows`, `long-rows`, `non-numeric-cells`, `no-time-column`, `time-not-monotonic`

- [ ] **Step 1: Add the fixture**

Save the user's file as `tests/fixtures/autodata-sheet2.csv` (UTF-8, unchanged content).

- [ ] **Step 2: Write the failing time-helper tests**

`tests/unit/io/time.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import {
  isMillisChannel,
  isNonDecreasing,
  isTimeChannel,
  parseClockOrDate,
  toRelativeSeconds,
} from '@/io/csv/time';

test.each([
  ['Time', 's', true],
  ['time', undefined, true],
  ['Timestamp', undefined, true],
  ['SecL', undefined, true],
  ['ms', undefined, true],
  ['Elapsed', 's', true],
  ['RPM', 'rpm', false],
  ['Time Since Start Of Boost', undefined, false],
])('isTimeChannel(%s, %s) = %s', (name, unit, expected) => {
  expect(isTimeChannel(name, unit)).toBe(expected);
});

test('isMillisChannel', () => {
  expect(isMillisChannel('ms')).toBe(true);
  expect(isMillisChannel('Time', 'ms')).toBe(true);
  expect(isMillisChannel('Time', 's')).toBe(false);
});

describe('parseClockOrDate', () => {
  test('clock times → seconds of day', () => {
    expect(parseClockOrDate('12:00:01.5')).toBeCloseTo(43201.5);
  });
  test('date-times → epoch seconds', () => {
    const a = parseClockOrDate('2026-10-01 12:00:00.000');
    const b = parseClockOrDate('2026-10-01 12:00:00.500');
    expect(b - a).toBeCloseTo(0.5);
  });
  test('rejects words and bare numbers', () => {
    expect(parseClockOrDate('Idle')).toBeNaN();
    expect(parseClockOrDate('12')).toBeNaN();
    expect(parseClockOrDate('')).toBeNaN();
  });
});

test('isNonDecreasing ignores gaps', () => {
  expect(isNonDecreasing(Float64Array.of(0, NaN, 1, 1, 2))).toBe(true);
  expect(isNonDecreasing(Float64Array.of(0, 2, 1))).toBe(false);
  expect(isNonDecreasing(Float64Array.of(NaN, NaN))).toBe(false);
});

test('toRelativeSeconds scales, rebases and forward-fills', () => {
  expect(Array.from(toRelativeSeconds(Float64Array.of(NaN, 1000, NaN, 1100), 0.001))).toEqual([
    0, 0, 0, 0.1,
  ]);
});
```
(`[0, 0, 0, 0.1]`: `(1100 - 1000) * 0.001` is exactly `0.1` in IEEE doubles.)

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/io/time.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/io/csv/time.ts`**

```ts
import type { Channel, ParseWarning, TimeSource } from '@/data/types';

const TIME_NAME = /^(time|timestamp|secl?|seconds?|ms|millis(econds)?)$/i;
const MS_NAME = /^(ms|millis(econds)?)$/i;
const TIME_UNIT = /^(s|sec|secs|ms)$/i;
const CLOCK = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/;
const HAS_DATE = /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;

export function isTimeChannel(name: string, unit?: string): boolean {
  return TIME_NAME.test(name.trim()) || (unit !== undefined && TIME_UNIT.test(unit.trim()));
}

export function isMillisChannel(name: string, unit?: string): boolean {
  return MS_NAME.test(name.trim()) || unit?.trim().toLowerCase() === 'ms';
}

/** "hh:mm:ss(.sss)" → seconds of day; a date-time string → epoch seconds; otherwise NaN. */
export function parseClockOrDate(cell: string): number {
  const s = cell.trim();
  if (!s) return NaN;
  const m = CLOCK.exec(s);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  // Require a date part so Date.parse doesn't accept arbitrary words or bare numbers.
  if (!HAS_DATE.test(s)) return NaN;
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t / 1000;
}

export function isNonDecreasing(values: Float64Array): boolean {
  let prev = -Infinity;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    if (v < prev) return false;
    prev = v;
  }
  return prev !== -Infinity;
}

/** Multiplies by `scale`, shifts so the first sample is 0, and forward-fills gaps (x values can't be NaN). */
export function toRelativeSeconds(values: Float64Array, scale: number): Float64Array {
  const out = new Float64Array(values.length);
  let first = NaN;
  for (const v of values) {
    if (!Number.isNaN(v)) {
      first = v;
      break;
    }
  }
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isNaN(v)) prev = (v - first) * scale;
    out[i] = prev;
  }
  return out;
}

export function pickTime(
  channels: Channel[],
  datetimeIds: Set<string>,
  rowCount: number,
): { time: Float64Array; timeSource: TimeSource; warning?: ParseWarning } {
  let rejected: Channel | undefined;
  for (const ch of channels) {
    if (ch.kind !== 'numeric' || !ch.values || !isTimeChannel(ch.name, ch.unit)) continue;
    if (!isNonDecreasing(ch.values)) {
      rejected ??= ch;
      continue;
    }
    const isDatetime = datetimeIds.has(ch.id);
    const isMs = !isDatetime && isMillisChannel(ch.name, ch.unit);
    return {
      time: toRelativeSeconds(ch.values, isMs ? 0.001 : 1),
      timeSource: {
        kind: 'column',
        channelId: ch.id,
        originalUnit: isDatetime ? 'datetime' : isMs ? 'ms' : 's',
      },
    };
  }

  const time = new Float64Array(rowCount);
  for (let i = 0; i < rowCount; i++) time[i] = i;
  const warning: ParseWarning = rejected
    ? {
        code: 'time-not-monotonic',
        message: `"${rejected.header}" goes backwards (logger reset?), so samples are plotted by row number.`,
      }
    : { code: 'no-time-column', message: 'No time column found, so samples are plotted by row number.' };
  return { time, timeSource: { kind: 'index' }, warning };
}
```

- [ ] **Step 5: Run time tests to verify they pass**

Run: `npx vitest run tests/unit/io/time.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing parser tests**

`tests/unit/io/parseCsv.test.ts`:
```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { parseCsvText } from '@/io/csv/parseCsv';

const parse = (text: string) => parseCsvText(text, { fileName: 'test.csv', encoding: 'utf-8' });
const byName = (log: Log, name: string) => {
  const ch = log.channels.find((c) => c.name === name);
  if (!ch) throw new Error(`no channel ${name}; have ${log.channels.map((c) => c.name).join(', ')}`);
  return ch;
};
const nums = (log: Log, name: string) => Array.from(byName(log, name).values!);
const codes = (log: Log) => log.meta.warnings.map((w) => w.code);

describe('real-world export (autodata fixture)', () => {
  const text = readFileSync('tests/fixtures/autodata-sheet2.csv', 'utf8');
  const log = parse(text);
  const dataLines = text.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1;

  test('reads every row and column with units', () => {
    expect(log.rowCount).toBe(dataLines);
    expect(log.channels.map((c) => [c.name, c.unit])).toEqual([
      ['Accelerator Position', '°TPS'],
      ['Calculated MAP', 'psi'],
      ['Coolant Temperature', '°C'],
      ['Engine Load', 'mg/stroke'],
      ['Filtered Load', 'mg/stroke'],
      ['Intake Air Temperature', '°C'],
    ]);
  });

  test('computes min/max and keeps the header row out of the data', () => {
    const tps = byName(log, 'Accelerator Position');
    expect(tps.values![0]).toBe(10.2);
    expect(tps.min).toBe(6.5);
    expect(tps.max).toBe(28.1);
    expect(byName(log, 'Engine Load').max).toBe(312.64);
  });

  test('falls back to row numbers with a notice', () => {
    expect(log.timeSource).toEqual({ kind: 'index' });
    expect(Array.from(log.time.slice(0, 3))).toEqual([0, 1, 2]);
    expect(codes(log)).toContain('no-time-column');
  });
});

test('semicolons, decimal commas, preamble, units row and a text column', () => {
  const log = parse(
    [
      'Capture Date: 2026-10-01',
      'Logger: TestBox v2',
      'Time;RPM;AFR;Mode',
      's;rpm;:1;',
      '0,00;812;14,7;Idle',
      '0,05;815,5;14,6;Idle',
      '0,10;1020;13,9;Open Loop',
    ].join('\n'),
  );
  expect(log.meta).toMatchObject({ delimiter: ';', decimal: ',' });
  expect(log.meta.preamble).toEqual(['Capture Date: 2026-10-01', 'Logger: TestBox v2']);
  expect(byName(log, 'RPM').unit).toBe('rpm');
  expect(byName(log, 'Mode').unit).toBeUndefined();
  expect(nums(log, 'RPM')).toEqual([812, 815.5, 1020]);
  expect(byName(log, 'Mode')).toMatchObject({ kind: 'text', values: null, text: ['Idle', 'Idle', 'Open Loop'] });
  expect(log.timeSource).toEqual({ kind: 'column', channelId: byName(log, 'Time').id, originalUnit: 's' });
  expect(log.time[2]).toBeCloseTo(0.1);
});

test('millisecond time column', () => {
  const log = parse('ms,RPM\n0,800\n50,810\n100,820');
  expect(log.timeSource).toMatchObject({ kind: 'column', originalUnit: 'ms' });
  expect(log.time[0]).toBe(0);
  expect(log.time[1]).toBeCloseTo(0.05);
  expect(log.time[2]).toBeCloseTo(0.1);
});

test('date-time and clock time columns', () => {
  const dt = parse('Timestamp,RPM\n2026-10-01 12:00:00.000,800\n2026-10-01 12:00:00.500,810');
  expect(dt.timeSource).toMatchObject({ kind: 'column', originalUnit: 'datetime' });
  expect(dt.time[1]).toBeCloseTo(0.5);

  const clock = parse('Time,RPM\n12:00:00.0,800\n12:00:00.1,810');
  expect(clock.timeSource).toMatchObject({ kind: 'column', originalUnit: 'datetime' });
  expect(clock.time[1]).toBeCloseTo(0.1);
});

test('ragged rows load with gaps and warnings', () => {
  const log = parse('a,b,c\n1,2,3\n4,5\n6,7,8,9');
  expect(nums(log, 'c')).toEqual([3, NaN, 8]);
  expect(log.meta.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'short-rows', count: 1, firstRow: 3 }),
      expect.objectContaining({ code: 'long-rows', count: 1, firstRow: 4 }),
    ]),
  );
});

test('a few non-numeric cells become gaps with a warning', () => {
  const rows = Array.from({ length: 20 }, (_, i) => `${i},${i === 7 ? 'ERR' : i * 2}`);
  const log = parse(['n,v', ...rows].join('\n'));
  expect(byName(log, 'v').kind).toBe('numeric');
  expect(byName(log, 'v').values![7]).toBeNaN();
  expect(log.meta.warnings).toContainEqual(expect.objectContaining({ code: 'non-numeric-cells', count: 1 }));
});

test('no header row → generated names', () => {
  const log = parse('1,2\n3,4');
  expect(log.channels.map((c) => c.header)).toEqual(['Column 1', 'Column 2']);
  expect(log.rowCount).toBe(2);
});

describe('errors', () => {
  const codeOf = (text: string) => {
    try {
      parse(text);
    } catch (e) {
      return e instanceof LogParseError ? e.code : 'not-a-LogParseError';
    }
    return 'no-error';
  };
  test('empty file', () => expect(codeOf('')).toBe('empty'));
  test('blank lines only', () => expect(codeOf('\n \n')).toBe('empty'));
  test('header but no rows', () => expect(codeOf('a,b\n')).toBe('empty'));
  test('no numeric columns', () => expect(codeOf('name,colour\nfoo,red\nbar,blue')).toBe('no-numeric-columns'));
});

describe('review focus', () => {
  test('trailing empty columns from spreadsheet exports are dropped', () => {
    const log = parse('a,b,,\n1,2,,\n3,4,,');
    expect(log.channels.map((c) => c.header)).toEqual(['a', 'b']);
  });

  test('duplicate headers stay distinct', () => {
    const log = parse('Lambda,Lambda\n1,2');
    expect(log.channels.map((c) => c.header)).toEqual(['Lambda', 'Lambda #2']);
    expect(new Set(log.channels.map((c) => c.id)).size).toBe(2);
  });

  test('quoted cells containing the delimiter', () => {
    const log = parse('id,"Status, note",RPM\n1,"ok, fine",800\n2,"bad, really",900');
    expect(log.channels.map((c) => c.header)).toEqual(['id', 'Status, note', 'RPM']);
    expect(byName(log, 'Status, note').text).toEqual(['ok, fine', 'bad, really']);
    expect(codes(log)).not.toContain('long-rows');
  });

  test('CRLF and a trailing newline add no phantom row', () => {
    expect(parse('a,b\r\n1,2\r\n3,4\r\n').rowCount).toBe(2);
  });

  test('a time column that goes backwards falls back to row numbers', () => {
    const log = parse('Time,RPM\n0,800\n1,810\n0.5,820');
    expect(log.timeSource).toEqual({ kind: 'index' });
    expect(codes(log)).toContain('time-not-monotonic');
  });
});

test('reports progress ending at 1', () => {
  const seen: number[] = [];
  const rows = Array.from({ length: 50_000 }, (_, i) => `${i},${i}`).join('\n');
  parseCsvText(`a,b\n${rows}`, { fileName: 'p.csv', encoding: 'utf-8', onProgress: (f) => seen.push(f) });
  expect(seen.length).toBeGreaterThan(1);
  expect(seen.at(-1)).toBe(1);
  expect(seen.every((f, i) => i === 0 || f >= seen[i - 1])).toBe(true);
});
```

`tests/unit/io/parseCsv.perf.test.ts`:
```ts
// @vitest-environment node
import { expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';

// Guards against accidental O(n²) work. 250k × 20 keeps CI fast; 1M rows is checked manually before release.
test('parses 250k rows × 20 columns within budget', () => {
  const header = ['Time (s)', ...Array.from({ length: 19 }, (_, i) => `Ch${i} (u)`)].join(',');
  const lines = [header];
  for (let r = 0; r < 250_000; r++) {
    const cells = [(r / 20).toFixed(2)];
    for (let c = 0; c < 19; c++) cells.push(((r * (c + 1)) % 1000 / 10).toFixed(1));
    lines.push(cells.join(','));
  }
  const text = lines.join('\n');

  const start = performance.now();
  const log = parseCsvText(text, { fileName: 'big.csv', encoding: 'utf-8' });
  const ms = performance.now() - start;

  expect(log.rowCount).toBe(250_000);
  expect(log.channels).toHaveLength(20);
  expect(ms).toBeLessThan(8000);
}, 30_000);
```

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run tests/unit/io/parseCsv`
Expected: FAIL — `@/io/csv/parseCsv` not found.

- [ ] **Step 8: Implement `src/io/csv/parseCsv.ts`**

```ts
import Papa from 'papaparse';
import { splitHeaderUnit } from '@/data/channels';
import { LogParseError } from '@/data/errors';
import { GrowableF64 } from '@/data/growable';
import { finiteMinMax } from '@/data/stats';
import type { Channel, Log, ParseWarning } from '@/data/types';
import type { TextEncodingName } from './decode';
import { parseNumber } from './number';
import {
  detectDecimalComma,
  detectDelimiter,
  findHeaderIndex,
  numericFraction,
  splitLine,
  type Delimiter,
} from './sniff';
import { isTimeChannel, parseClockOrDate, pickTime, toRelativeSeconds } from './time';

export interface CsvParseOptions {
  fileName: string;
  encoding: TextEncodingName;
  onProgress?: (fraction: number) => void;
}

type ColumnKind = 'numeric' | 'text' | 'datetime';

interface CsvLayout {
  delimiter: Delimiter;
  decimal: '.' | ',';
  preambleLines: number;
  hasHeader: boolean;
  hasUnitsRow: boolean;
  columnCount: number;
  kinds: ColumnKind[];
}

const SNIFF_LINES = 1200;
const NUMERIC_THRESHOLD = 0.9;
const PROGRESS_EVERY = 20_000;

/** The first `max` non-empty lines, without splitting the whole text. */
export function firstLines(text: string, max: number): string[] {
  const lines: string[] = [];
  let start = 0;
  while (lines.length < max && start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, '');
    if (line.trim() !== '') lines.push(line);
    start = end + 1;
  }
  return lines;
}

function classifyColumn(cells: string[], decimal: '.' | ',', header: string): ColumnKind {
  const nonBlank = cells.filter((c) => c.trim() !== '');
  if (nonBlank.length === 0) return 'numeric';
  if (numericFraction(nonBlank, decimal) >= NUMERIC_THRESHOLD) return 'numeric';
  const { name, unit } = splitHeaderUnit(header);
  if (isTimeChannel(name, unit)) {
    const dated = nonBlank.filter((c) => !Number.isNaN(parseClockOrDate(c))).length;
    if (dated / nonBlank.length >= NUMERIC_THRESHOLD) return 'datetime';
  }
  return 'text';
}

export function sniffLayout(lines: string[]): CsvLayout {
  const delimiter = detectDelimiter(lines);
  const preambleLines = findHeaderIndex(lines, delimiter);
  const rows = lines.slice(preambleLines).map((l) => splitLine(l, delimiter));
  const decimal = detectDecimalComma(rows, delimiter) ? ',' : '.';
  const columnCount = rows[0]?.length ?? 0;

  const hasHeader = rows.length > 0 && numericFraction(rows[0], decimal) < 0.5;
  const hasUnitsRow =
    hasHeader &&
    rows.length > 2 &&
    numericFraction(rows[1], decimal) < 0.5 &&
    numericFraction(rows[2], decimal) >= 0.5;

  const sample = rows.slice((hasHeader ? 1 : 0) + (hasUnitsRow ? 1 : 0));
  const headers = hasHeader ? rows[0] : [];
  const kinds = Array.from({ length: columnCount }, (_, c) =>
    classifyColumn(
      sample.map((r) => r[c] ?? ''),
      decimal,
      headers[c] ?? '',
    ),
  );
  return { delimiter, decimal, preambleLines, hasHeader, hasUnitsRow, columnCount, kinds };
}

function uniqueHeader(base: string, seen: Map<string, number>): string {
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base} #${n}`;
}

export function parseCsvText(text: string, opts: CsvParseOptions): Log {
  const lines = firstLines(text, SNIFF_LINES);
  if (lines.length === 0) throw new LogParseError('empty', `"${opts.fileName}" is empty.`);

  const layout = sniffLayout(lines);
  const { columnCount, kinds, decimal, delimiter } = layout;
  const headerRow = layout.preambleLines;
  const unitsRow = layout.hasUnitsRow ? headerRow + 1 : -1;

  const numeric = kinds.map((k) => (k === 'text' ? null : new GrowableF64()));
  const texts = kinds.map((k) => (k === 'text' ? ([] as string[]) : null));
  const badCells = new Array<number>(columnCount).fill(0);
  const preamble: string[] = [];
  let headers: string[] = [];
  let units: string[] = [];
  let rowIndex = 0;
  let dataRows = 0;
  let short = 0;
  let long = 0;
  let firstShort = 0;
  let firstLong = 0;

  Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: 'greedy',
    step: (result) => {
      const row = result.data;
      const r = rowIndex++;
      if (r < headerRow) {
        preamble.push(row.join(delimiter));
        return;
      }
      if (layout.hasHeader && r === headerRow) {
        headers = row;
        return;
      }
      if (r === unitsRow) {
        units = row;
        return;
      }

      if (row.length < columnCount) {
        if (short++ === 0) firstShort = r + 1;
      } else if (row.length > columnCount) {
        if (long++ === 0) firstLong = r + 1;
      }
      for (let c = 0; c < columnCount; c++) {
        const cell = row[c] ?? '';
        const kind = kinds[c];
        if (kind === 'text') {
          texts[c]!.push(cell);
          continue;
        }
        const v = kind === 'numeric' ? parseNumber(cell, decimal) : parseClockOrDate(cell);
        if (Number.isNaN(v) && cell.trim() !== '') badCells[c]++;
        numeric[c]!.push(v);
      }

      dataRows++;
      if (opts.onProgress && dataRows % PROGRESS_EVERY === 0) {
        opts.onProgress(Math.min(result.meta.cursor / text.length, 0.99));
      }
    },
  });

  if (dataRows === 0) {
    throw new LogParseError('empty', `"${opts.fileName}" has no data rows.`);
  }

  const warnings: ParseWarning[] = [];
  if (short) {
    warnings.push({
      code: 'short-rows',
      message: `${short} row(s) had fewer than ${columnCount} columns; missing cells are shown as gaps.`,
      count: short,
      firstRow: firstShort,
    });
  }
  if (long) {
    warnings.push({
      code: 'long-rows',
      message: `${long} row(s) had more than ${columnCount} columns; the extra cells were ignored.`,
      count: long,
      firstRow: firstLong,
    });
  }

  const channels: Channel[] = [];
  const datetimeIds = new Set<string>();
  const seen = new Map<string, number>();
  for (let c = 0; c < columnCount; c++) {
    const rawHeader = (headers[c] ?? '').trim();
    let values = numeric[c]?.toArray() ?? null;
    const text_ = texts[c];
    const empty = values ? values.every(Number.isNaN) : text_!.every((t) => t.trim() === '');
    if (rawHeader === '' && empty) continue; // spreadsheet padding columns

    const header = uniqueHeader(rawHeader || `Column ${c + 1}`, seen);
    const split = splitHeaderUnit(header);
    const unitCell = (units[c] ?? '').trim();
    const id = `c${c}`;
    if (kinds[c] === 'datetime' && values) {
      values = toRelativeSeconds(values, 1);
      datetimeIds.add(id);
    }
    if (badCells[c]) {
      warnings.push({
        code: 'non-numeric-cells',
        message: `${badCells[c]} cell(s) in "${header}" weren't numbers and are shown as gaps.`,
        count: badCells[c],
      });
    }
    const { min, max } = values ? finiteMinMax(values) : { min: NaN, max: NaN };
    channels.push({
      id,
      header,
      name: split.name,
      unit: unitCell || split.unit,
      kind: values ? 'numeric' : 'text',
      values,
      text: text_,
      min,
      max,
    });
  }

  if (!channels.some((ch) => ch.kind === 'numeric')) {
    throw new LogParseError(
      'no-numeric-columns',
      `No numeric columns found in "${opts.fileName}". Columns detected: ${channels.map((c) => c.header).join(', ')}.`,
    );
  }

  const { time, timeSource, warning } = pickTime(channels, datetimeIds, dataRows);
  if (warning) warnings.push(warning);
  opts.onProgress?.(1);

  return {
    id: crypto.randomUUID(),
    fileName: opts.fileName,
    rowCount: dataRows,
    time,
    timeSource,
    channels,
    meta: { delimiter, decimal, encoding: opts.encoding, preamble, warnings },
  };
}
```

- [ ] **Step 9: Run the parser tests**

Run: `npx vitest run tests/unit/io`
Expected: PASS (perf test well under 8 s on a dev machine).

- [ ] **Step 10: Commit**

```bash
npx prettier --write src tests/unit
git add -A
git commit -m "feat(io): CSV parser with units, time detection and messy-file handling"
```

---

### Task 7: Reader registry and parse worker

**Files:**
- Create: `src/io/types.ts`, `src/io/csv/reader.ts`, `src/io/registry.ts`, `src/workers/protocol.ts`, `src/workers/parse.worker.ts`, `src/workers/parseClient.ts`
- Test: `tests/unit/io/registry.test.ts`, `tests/unit/workers/protocol.test.ts`

**Interfaces:**
- Consumes: `parseCsvText`, `decodeBytes`, `Log`, `LogParseError`, `LogErrorCode`.
- Produces (exact):
  - `interface LogReader { id: string; extensions: string[]; sniff(head: Uint8Array, fileName: string): number; parse(file: File, onProgress: (fraction: number) => void): Promise<Log> }`
  - `csvReader: LogReader`; `READERS: LogReader[]`; `readLog(file: File, onProgress: (fraction: number) => void): Promise<Log>`
  - `type WorkerRequest = { type: 'parse'; file: File }`
  - `type WorkerResponse = { type: 'progress'; fraction: number } | { type: 'done'; log: Log } | { type: 'error'; code: LogErrorCode; message: string }`
  - `transferablesOf(log: Log): ArrayBuffer[]`; `toErrorResponse(err: unknown): Extract<WorkerResponse, { type: 'error' }>`
  - `parseFileInWorker(file: File, onProgress: (fraction: number) => void): Promise<Log>`

- [ ] **Step 1: Write the failing tests**

`tests/unit/io/registry.test.ts`:
```ts
// @vitest-environment node
import { expect, test } from 'vitest';
import { LogParseError } from '@/data/errors';
import { csvReader } from '@/io/csv/reader';
import { readLog } from '@/io/registry';

test('csvReader prefers known extensions and rejects binary', () => {
  const text = new TextEncoder().encode('a,b\n1,2');
  expect(csvReader.sniff(text, 'run.csv')).toBeGreaterThan(csvReader.sniff(text, 'run.dat'));
  expect(csvReader.sniff(new Uint8Array([0x4d, 0x4c, 0x00, 0x01]), 'run.mlg')).toBe(0);
});

test('readLog parses a CSV File and reports progress', async () => {
  const seen: number[] = [];
  const log = await readLog(new File(['Time,RPM\n0,800\n0.05,810'], 'run.csv'), (f) => seen.push(f));
  expect(log.fileName).toBe('run.csv');
  expect(log.rowCount).toBe(2);
  expect(log.meta.encoding).toBe('utf-8');
  expect(seen.at(-1)).toBe(1);
});

test('readLog rejects unsupported files', async () => {
  const file = new File([new Uint8Array([0, 1, 2, 3])], 'blob.bin');
  await expect(readLog(file, () => {})).rejects.toMatchObject({ code: 'unsupported' });
  await expect(readLog(file, () => {})).rejects.toBeInstanceOf(LogParseError);
});
```

`tests/unit/workers/protocol.test.ts`:
```ts
import { expect, test } from 'vitest';
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { toErrorResponse, transferablesOf } from '@/workers/protocol';

test('transferablesOf lists each numeric buffer once', () => {
  const values = Float64Array.of(1, 2);
  const log = {
    time: Float64Array.of(0, 1),
    channels: [
      { values, text: null },
      { values: null, text: ['a', 'b'] },
      { values, text: null },
    ],
  } as unknown as Log;
  const buffers = transferablesOf(log);
  expect(buffers).toHaveLength(2);
  expect(buffers).toContain(values.buffer);
  expect(buffers).toContain(log.time.buffer);
});

test('toErrorResponse maps error kinds', () => {
  expect(toErrorResponse(new LogParseError('empty', 'nope'))).toEqual({ type: 'error', code: 'empty', message: 'nope' });
  expect(toErrorResponse(new RangeError('Array buffer allocation failed'))).toMatchObject({ code: 'out-of-memory' });
  expect(toErrorResponse(new Error('boom'))).toEqual({ type: 'error', code: 'internal', message: 'boom' });
  expect(toErrorResponse('weird')).toMatchObject({ code: 'internal' });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/io/registry.test.ts tests/unit/workers`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/io/types.ts`:
```ts
import type { Log } from '@/data/types';

export interface LogReader {
  id: string;
  extensions: string[];
  /** Confidence 0..1 that this reader handles the file, from its first ~64 KB. */
  sniff(head: Uint8Array, fileName: string): number;
  parse(file: File, onProgress: (fraction: number) => void): Promise<Log>;
}
```

`src/io/csv/reader.ts`:
```ts
import type { LogReader } from '../types';
import { decodeBytes } from './decode';
import { parseCsvText } from './parseCsv';

const EXTENSIONS = ['.csv', '.tsv', '.txt', '.log'];

export const csvReader: LogReader = {
  id: 'csv',
  extensions: EXTENSIONS,
  sniff(head, fileName) {
    if (head.includes(0)) return 0; // binary
    const dot = fileName.lastIndexOf('.');
    const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
    return EXTENSIONS.includes(ext) ? 0.9 : 0.5;
  },
  async parse(file, onProgress) {
    const { text, encoding } = decodeBytes(new Uint8Array(await file.arrayBuffer()));
    return parseCsvText(text, { fileName: file.name, encoding, onProgress });
  },
};
```

`src/io/registry.ts`:
```ts
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { csvReader } from './csv/reader';
import type { LogReader } from './types';

export const READERS: LogReader[] = [csvReader];

const HEAD_BYTES = 64 * 1024;

export async function readLog(file: File, onProgress: (fraction: number) => void): Promise<Log> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  let best: { reader: LogReader; score: number } | undefined;
  for (const reader of READERS) {
    const score = reader.sniff(head, file.name);
    if (score > 0 && (!best || score > best.score)) best = { reader, score };
  }
  if (!best) {
    throw new LogParseError(
      'unsupported',
      `DataLogViewer can't read "${file.name}". Supported formats: CSV, TSV and other delimited text logs.`,
    );
  }
  return best.reader.parse(file, onProgress);
}
```

`src/workers/protocol.ts`:
```ts
import { LogParseError, type LogErrorCode } from '@/data/errors';
import type { Log } from '@/data/types';

export type WorkerRequest = { type: 'parse'; file: File };

export type WorkerResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; log: Log }
  | { type: 'error'; code: LogErrorCode; message: string };

export function transferablesOf(log: Log): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>([log.time.buffer as ArrayBuffer]);
  for (const ch of log.channels) if (ch.values) buffers.add(ch.values.buffer as ArrayBuffer);
  return [...buffers];
}

export function toErrorResponse(err: unknown): Extract<WorkerResponse, { type: 'error' }> {
  if (err instanceof LogParseError) return { type: 'error', code: err.code, message: err.message };
  if (err instanceof RangeError) {
    return {
      type: 'error',
      code: 'out-of-memory',
      message: 'This log is too large for the browser to hold in memory. Try a smaller file.',
    };
  }
  if (err instanceof Error) return { type: 'error', code: 'internal', message: err.message };
  return { type: 'error', code: 'internal', message: String(err) };
}
```

`src/workers/parse.worker.ts`:
```ts
import { readLog } from '@/io/registry';
import { toErrorResponse, transferablesOf, type WorkerRequest, type WorkerResponse } from './protocol';

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, { transfer });

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const log = await readLog(event.data.file, (fraction) => post({ type: 'progress', fraction }));
    post({ type: 'done', log }, transferablesOf(log));
  } catch (err) {
    post(toErrorResponse(err));
  }
};
```

`src/workers/parseClient.ts`:
```ts
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

/** Parses a file in a fresh Web Worker so large logs never block the UI. */
export function parseFileInWorker(file: File, onProgress: (fraction: number) => void): Promise<Log> {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<Log>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        onProgress(msg.fraction);
        return;
      }
      worker.terminate();
      if (msg.type === 'done') resolve(msg.log);
      else reject(new LogParseError(msg.code, msg.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new LogParseError('internal', event.message || 'The file parser crashed.'));
    };
    worker.postMessage({ type: 'parse', file } satisfies WorkerRequest);
  });
}
```

- [ ] **Step 4: Run tests, typecheck and build (the build proves Vite bundles the worker)**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all PASS; build output includes a separate `parse.worker-*.js` asset.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src tests/unit
git add -A
git commit -m "feat(io): pluggable reader registry and off-thread parse worker"
```

---

### Task 8: Log store

**Files:**
- Create: `src/state/logStore.ts`
- Test: `tests/unit/state/logStore.test.ts`

**Interfaces:**
- Consumes: `parseFileInWorker`, `Log`, `LogParseError`, `LogErrorCode`.
- Produces (exact):
  - `type ParseFn = (file: File, onProgress: (fraction: number) => void) => Promise<Log>`
  - `type LoadStatus = { kind: 'idle' } | { kind: 'loading'; fileName: string; progress: number } | { kind: 'error'; fileName: string; code: LogErrorCode; message: string }`
  - `interface SampleLog { label: string; fileName: string; path: string }`; `SAMPLES: SampleLog[]`
  - `LARGE_FILE_BYTES = 150 * 1024 * 1024`
  - `interface LogState { logs: Record<string, Log>; activeLogId: string | null; status: LoadStatus; loadFile(file: File): Promise<void>; loadSample(sample: SampleLog): Promise<void>; dismissError(): void }`
  - `createLogStore(parse: ParseFn, fetchFn?: typeof fetch)` → Zustand hook; `useLogStore`; `selectActiveLog(s: LogState): Log | null`

- [ ] **Step 1: Write the failing test**

`tests/unit/state/logStore.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest';
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { createLogStore, SAMPLES, selectActiveLog, type ParseFn } from '@/state/logStore';

const fakeLog = (id: string, fileName: string) => ({ id, fileName }) as Log;
const file = (name: string) => new File(['x'], name);

describe('logStore', () => {
  test('loading a file reports progress, then makes it the only active log', async () => {
    let finish!: (log: Log) => void;
    let report!: (f: number) => void;
    const parse: ParseFn = (_f, onProgress) => {
      report = onProgress;
      return new Promise((r) => (finish = r));
    };
    const store = createLogStore(parse);
    const done = store.getState().loadFile(file('a.csv'));
    expect(store.getState().status).toEqual({ kind: 'loading', fileName: 'a.csv', progress: 0 });
    report(0.5);
    expect(store.getState().status).toMatchObject({ progress: 0.5 });
    finish(fakeLog('A', 'a.csv'));
    await done;
    expect(store.getState().status).toEqual({ kind: 'idle' });
    expect(selectActiveLog(store.getState())?.id).toBe('A');
  });

  test('a new file replaces the previous log', async () => {
    const queue = [fakeLog('A', 'a.csv'), fakeLog('B', 'b.csv')];
    const store = createLogStore(async () => queue.shift()!);
    await store.getState().loadFile(file('a.csv'));
    await store.getState().loadFile(file('b.csv'));
    expect(Object.keys(store.getState().logs)).toEqual(['B']);
    expect(store.getState().activeLogId).toBe('B');
  });

  test('parse errors become an error status that can be dismissed', async () => {
    const store = createLogStore(async () => {
      throw new LogParseError('no-numeric-columns', 'No numeric columns');
    });
    await store.getState().loadFile(file('bad.csv'));
    expect(store.getState().status).toEqual({
      kind: 'error',
      fileName: 'bad.csv',
      code: 'no-numeric-columns',
      message: 'No numeric columns',
    });
    store.getState().dismissError();
    expect(store.getState().status).toEqual({ kind: 'idle' });
  });

  test('unexpected errors are reported as internal', async () => {
    const store = createLogStore(async () => {
      throw new Error('boom');
    });
    await store.getState().loadFile(file('x.csv'));
    expect(store.getState().status).toMatchObject({ kind: 'error', code: 'internal', message: 'boom' });
  });

  test('loadSample fetches the bundled file and parses it', async () => {
    const fetchFn = vi.fn(async () => new Response('Time,RPM\n0,800'));
    const parse = vi.fn<ParseFn>(async (f) => fakeLog('S', f.name));
    const store = createLogStore(parse, fetchFn as unknown as typeof fetch);
    await store.getState().loadSample(SAMPLES[0]);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/samples\/demo-run\.csv$/);
    expect(parse.mock.calls[0][0].name).toBe('demo-run.csv');
    expect(selectActiveLog(store.getState())?.id).toBe('S');
  });

  test('a failed sample download is an error, not a hang', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }));
    const store = createLogStore(vi.fn(), fetchFn as unknown as typeof fetch);
    await store.getState().loadSample(SAMPLES[0]);
    expect(store.getState().status).toMatchObject({ kind: 'error', code: 'internal' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/state`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/state/logStore.ts`**

```ts
import { create } from 'zustand';
import { LogParseError, type LogErrorCode } from '@/data/errors';
import type { Log } from '@/data/types';
import { parseFileInWorker } from '@/workers/parseClient';

export type ParseFn = (file: File, onProgress: (fraction: number) => void) => Promise<Log>;

export type LoadStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string; progress: number }
  | { kind: 'error'; fileName: string; code: LogErrorCode; message: string };

export interface SampleLog {
  label: string;
  fileName: string;
  /** Relative to the site base URL. */
  path: string;
}

export const SAMPLES: SampleLog[] = [
  { label: 'Demo engine run', fileName: 'demo-run.csv', path: 'samples/demo-run.csv' },
  { label: 'Real-world export', fileName: 'autodata-sheet2.csv', path: 'samples/autodata-sheet2.csv' },
];

/** Above this size the UI asks before loading. */
export const LARGE_FILE_BYTES = 150 * 1024 * 1024;

export interface LogState {
  logs: Record<string, Log>;
  activeLogId: string | null;
  status: LoadStatus;
  loadFile(file: File): Promise<void>;
  loadSample(sample: SampleLog): Promise<void>;
  dismissError(): void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createLogStore(
  parse: ParseFn,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
) {
  return create<LogState>()((set, get) => ({
    logs: {},
    activeLogId: null,
    status: { kind: 'idle' },

    async loadFile(file) {
      set({ status: { kind: 'loading', fileName: file.name, progress: 0 } });
      try {
        const log = await parse(file, (progress) => {
          const s = get().status;
          if (s.kind === 'loading') set({ status: { ...s, progress } });
        });
        // Tier 1 shows one log at a time; the map shape is kept for log comparison later.
        set({ logs: { [log.id]: log }, activeLogId: log.id, status: { kind: 'idle' } });
      } catch (err) {
        const code = err instanceof LogParseError ? err.code : 'internal';
        set({ status: { kind: 'error', fileName: file.name, code, message: message(err) } });
      }
    },

    async loadSample(sample) {
      set({ status: { kind: 'loading', fileName: sample.fileName, progress: 0 } });
      try {
        const res = await fetchFn(`${import.meta.env.BASE_URL}${sample.path}`);
        if (!res.ok) throw new Error(`Couldn't download the sample log (HTTP ${res.status}).`);
        const blob = await res.blob();
        await get().loadFile(new File([blob], sample.fileName, { type: 'text/csv' }));
      } catch (err) {
        set({ status: { kind: 'error', fileName: sample.fileName, code: 'internal', message: message(err) } });
      }
    },

    dismissError() {
      set({ status: { kind: 'idle' } });
    },
  }));
}

export const useLogStore = createLogStore(parseFileInWorker);

export const selectActiveLog = (s: LogState): Log | null =>
  s.activeLogId ? (s.logs[s.activeLogId] ?? null) : null;
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/state`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src tests/unit
git add -A
git commit -m "feat(state): log store with progress, errors and bundled samples"
```

---

### Task 9: Sample logs

**Files:**
- Create: `scripts/demoLog.ts`, `scripts/generate-sample.ts`, `public/samples/demo-run.csv` (generated), `public/samples/autodata-sheet2.csv` (copy of the fixture)
- Test: `tests/unit/scripts/demoLog.test.ts`

**Interfaces:**
- Consumes: `parseCsvText`.
- Produces: `DEMO_HEADER: string[]`; `generateDemoLog(seed?: number): string`; the two files served at `samples/demo-run.csv` and `samples/autodata-sheet2.csv` (matching `SAMPLES` in Task 8).

- [ ] **Step 1: Write the failing test**

`tests/unit/scripts/demoLog.test.ts`:
```ts
// @vitest-environment node
import { expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { DEMO_HEADER, generateDemoLog } from '../../../scripts/demoLog';

const parse = (csv: string) => parseCsvText(csv, { fileName: 'demo-run.csv', encoding: 'utf-8' });

test('demo log is deterministic and parses cleanly', () => {
  const csv = generateDemoLog();
  expect(generateDemoLog()).toBe(csv);
  const log = parse(csv);
  expect(log.rowCount).toBe(9600);
  expect(log.channels.map((c) => c.header)).toEqual(DEMO_HEADER);
  expect(log.timeSource).toMatchObject({ kind: 'column', originalUnit: 's' });
  expect(log.meta.warnings).toEqual([]);
  const mode = log.channels.find((c) => c.name === 'Fuel Mode')!;
  expect(mode.kind).toBe('text');
  expect(new Set(mode.text)).toEqual(new Set(['Idle', 'Closed Loop', 'Open Loop', 'Decel Cut']));
});

test('values stay physically plausible', () => {
  const log = parse(generateDemoLog());
  const range = (name: string) => {
    const ch = log.channels.find((c) => c.name === name)!;
    return [ch.min, ch.max];
  };
  const [rpmMin, rpmMax] = range('Engine Speed');
  expect(rpmMin).toBeGreaterThan(700);
  expect(rpmMax).toBeLessThanOrEqual(6900);
  const [, mapMax] = range('MAP');
  expect(mapMax).toBeGreaterThan(150);
  expect(mapMax).toBeLessThan(220);
  const [afrMin, afrMax] = range('AFR');
  expect(afrMin).toBeGreaterThan(10.5);
  expect(afrMax).toBeLessThan(23);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/scripts`
Expected: FAIL — `scripts/demoLog` not found.

- [ ] **Step 3: Implement the generator**

`scripts/demoLog.ts`:
```ts
/**
 * Deterministic, physically plausible demo log: 8 minutes at 20 Hz from a turbocharged 5-speed car —
 * warm-up idle, cruising, three full-throttle pulls with gear changes, coast-downs, then idle.
 */
export const DEMO_HEADER = [
  'Time (s)',
  'Engine Speed (rpm)',
  'MAP (kPa)',
  'AFR',
  'Accelerator Position (%)',
  'Coolant Temperature (°C)',
  'Intake Air Temperature (°C)',
  'Ignition Advance (°)',
  'Battery Voltage (V)',
  'Fuel Mode',
];

const HZ = 20;
const SECONDS = 480;
const IDLE_RPM = 900;
const REDLINE = 6800;
const SHIFT_RATIO = 0.68;

type Phase = 'idle' | 'cruise' | 'pull' | 'decel';

const SCRIPT: { until: number; phase: Phase }[] = [
  { until: 40, phase: 'idle' },
  { until: 110, phase: 'cruise' },
  { until: 124, phase: 'pull' },
  { until: 140, phase: 'decel' },
  { until: 230, phase: 'cruise' },
  { until: 244, phase: 'pull' },
  { until: 260, phase: 'decel' },
  { until: 350, phase: 'cruise' },
  { until: 365, phase: 'pull' },
  { until: 390, phase: 'decel' },
  { until: SECONDS, phase: 'idle' },
];

/** Small seeded PRNG so the sample file is identical on every run. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toward = (v: number, target: number, k: number) => v + (target - v) * k;

export function generateDemoLog(seed = 412): string {
  const rand = mulberry32(seed);
  const noise = (amp: number) => (rand() * 2 - 1) * amp;
  const dt = 1 / HZ;

  let phase: Phase = 'idle';
  let rpm = IDLE_RPM;
  let gear = 1;
  let tps = 0;
  let afr = 14.7;
  let clt = 62;
  let iat = 24;
  const rows = [DEMO_HEADER.join(',')];

  for (let i = 0; i < SECONDS * HZ; i++) {
    const t = i * dt;
    const next = SCRIPT.find((s) => t < s.until)!.phase;
    if (next !== phase) {
      if (next === 'pull') {
        gear = 2;
        rpm = Math.max(rpm, 2400);
      }
      if (next === 'cruise') gear = 4;
      phase = next;
    }

    const targetTps = phase === 'pull' ? 100 : phase === 'cruise' ? 18 + 6 * Math.sin(t / 7) : 0;
    tps = clamp(toward(tps, targetTps, phase === 'pull' ? 0.35 : 0.12) + noise(0.4), 0, 100);

    if (phase === 'pull') {
      rpm += (2600 / gear) * (tps / 100) * dt;
      if (rpm > REDLINE) {
        if (gear < 5) {
          gear++;
          rpm *= SHIFT_RATIO;
        } else rpm = REDLINE;
      }
    } else if (phase === 'cruise') rpm = toward(rpm, 2300 + 400 * Math.sin(t / 11), 0.03);
    else if (phase === 'decel') rpm = toward(rpm, 1300, 0.02);
    else rpm = toward(rpm, IDLE_RPM, 0.05);
    rpm += noise(12);

    const load = tps / 100;
    const spool = clamp((rpm - 2500) / 2500, 0, 1);
    const coasting = phase === 'decel' && tps < 2;
    const map = coasting ? 22 + noise(1) : 30 + load * (70 + 110 * spool) + noise(1.2);

    const mode =
      coasting && rpm > 1500
        ? 'Decel Cut'
        : map > 105
          ? 'Open Loop'
          : phase === 'idle'
            ? 'Idle'
            : 'Closed Loop';
    const targetAfr =
      mode === 'Decel Cut' ? 21.5 : mode === 'Open Loop' ? 12.6 - 1.2 * clamp((map - 105) / 75, 0, 1) : 14.7;
    afr = toward(afr, targetAfr, 0.15) + noise(0.08);

    clt = clt < 88 ? clt + 0.0045 : 88;
    const coolant = clt >= 88 ? 88 + 1.2 * Math.sin(t / 40) : clt;
    iat = toward(iat, 24 + 18 * spool * load, 0.002) + noise(0.02);
    const ignition =
      map > 100 ? 14 - (map - 100) * 0.05 : phase === 'idle' ? 12 : 22 + 12 * (1 - load) * clamp(rpm / 4000, 0, 1);
    const battery = 14.1 - 0.25 * load + noise(0.04);

    rows.push(
      [
        t.toFixed(3),
        Math.round(rpm),
        map.toFixed(1),
        afr.toFixed(2),
        tps.toFixed(1),
        coolant.toFixed(1),
        iat.toFixed(1),
        (ignition + noise(0.2)).toFixed(1),
        battery.toFixed(2),
        mode,
      ].join(','),
    );
  }
  return rows.join('\n') + '\n';
}
```

`scripts/generate-sample.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDemoLog } from './demoLog';

const out = fileURLToPath(new URL('../public/samples/demo-run.csv', import.meta.url));
mkdirSync(dirname(out), { recursive: true });
const csv = generateDemoLog();
writeFileSync(out, csv, 'utf8');
console.log(`Wrote ${csv.trimEnd().split('\n').length - 1} rows to ${out}`);
```

- [ ] **Step 4: Run tests, then generate and copy the samples**

```bash
npx vitest run tests/unit/scripts
npm run sample
cp tests/fixtures/autodata-sheet2.csv public/samples/autodata-sheet2.csv
head -3 public/samples/demo-run.csv
```
Expected: tests PASS; `Wrote 9600 rows to .../public/samples/demo-run.csv`; header line followed by two data rows.

- [ ] **Step 5: Commit**

```bash
npx prettier --write scripts tests/unit
git add -A
git commit -m "feat: deterministic demo log generator and bundled sample logs"
```

---

### Task 10: Temporary load & inspect screen, with end-to-end tests

**Files:**
- Create: `src/config.ts`, `src/ui/LoadScreen.tsx`, `tests/e2e/load.spec.ts`
- Modify: `src/App.tsx` (replace `<main>` placeholder with `<LoadScreen />`)
- Test: `tests/unit/ui/LoadScreen.test.tsx`

**Interfaces:**
- Consumes: `useLogStore`, `selectActiveLog`, `SAMPLES`, `LARGE_FILE_BYTES`, `Log`.
- Produces: `REPO_URL` constant; `LoadScreen` component (TEMPORARY — Plan B replaces it; only `REPO_URL` and the drop/confirm behaviour carry over).

- [ ] **Step 1: Write the failing component test**

`tests/unit/ui/LoadScreen.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { useLogStore } from '@/state/logStore';
import { LoadScreen } from '@/ui/LoadScreen';

beforeEach(() => useLogStore.setState({ logs: {}, activeLogId: null, status: { kind: 'idle' } }));

test('offers file opening and both samples', () => {
  render(<LoadScreen />);
  expect(screen.getByLabelText('Open log')).toHaveAttribute('type', 'file');
  expect(screen.getByRole('button', { name: 'Demo engine run' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Real-world export' })).toBeInTheDocument();
});

test('summarises the active log', () => {
  const log = parseCsvText('Time (s),RPM,AFR\n0,800,14.7\n0.05,810,14.6', {
    fileName: 'run.csv',
    encoding: 'utf-8',
  });
  useLogStore.setState({ logs: { [log.id]: log }, activeLogId: log.id });
  render(<LoadScreen />);
  expect(screen.getByTestId('row-count')).toHaveTextContent('2');
  expect(screen.getByTestId('time-source')).toHaveTextContent('Time (seconds)');
  expect(screen.getByRole('row', { name: /RPM/ })).toBeInTheDocument();
});

test('shows parse errors with a report link and can dismiss them', () => {
  useLogStore.setState({
    status: { kind: 'error', fileName: 'bad.csv', code: 'empty', message: '"bad.csv" is empty.' },
  });
  render(<LoadScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent('"bad.csv" is empty.');
  expect(screen.getByRole('link', { name: 'Report this file' })).toHaveAttribute(
    'href',
    expect.stringContaining('/issues/new'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('alert')).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/ui/LoadScreen.test.tsx`
Expected: FAIL — `@/ui/LoadScreen` not found.

- [ ] **Step 3: Implement**

`src/config.ts`:
```ts
export const REPO_URL = 'https://github.com/ElvisOkereke/datalogviewer';
```

`src/ui/LoadScreen.tsx`:
```tsx
import { useState, type DragEvent } from 'react';
import { REPO_URL } from '@/config';
import type { Log } from '@/data/types';
import { LARGE_FILE_BYTES, SAMPLES, selectActiveLog, useLogStore, type LoadStatus } from '@/state/logStore';

// TEMPORARY: proves the data pipeline end to end. Plan B replaces this with the Workbench UI.

const DELIMITER_NAMES: Record<string, string> = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab', '|': 'Pipe' };
const UNIT_LABEL = { s: 'seconds', ms: 'milliseconds', datetime: 'date-time' } as const;

const fmt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—';

function reportUrl(status: Extract<LoadStatus, { kind: 'error' }>): string {
  const title = `Can't open a log file (${status.code})`;
  const body = [
    `Error code: ${status.code}`,
    `Message: ${status.message}`,
    '',
    'Which logger or software produced the file?',
    '',
    "(Please don't attach files that contain private data.)",
  ].join('\n');
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export function LoadScreen() {
  const status = useLogStore((s) => s.status);
  const log = useLogStore(selectActiveLog);
  const { loadFile, loadSample, dismissError } = useLogStore.getState();
  const [dragging, setDragging] = useState(false);

  const open = (file: File | undefined) => {
    if (!file) return;
    const mb = Math.round(file.size / (1024 * 1024));
    if (
      file.size > LARGE_FILE_BYTES &&
      !window.confirm(`"${file.name}" is ${mb} MB. Large logs take longer and use a lot of memory. Load it anyway?`)
    ) {
      return;
    }
    void loadFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    open(e.dataTransfer.files[0]);
  };

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex-1 overflow-auto p-6 ${dragging ? 'outline-2 -outline-offset-8 outline-primary outline-dashed' : ''}`}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <section className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Open log
            <input
              type="file"
              accept=".csv,.tsv,.txt,.log,text/csv"
              className="sr-only"
              onChange={(e) => {
                open(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {SAMPLES.map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => void loadSample(s)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              {s.label}
            </button>
          ))}
          <span className="text-sm text-muted-foreground">or drop a CSV anywhere</span>
        </section>

        {status.kind === 'loading' && <Progress fileName={status.fileName} progress={status.progress} />}

        {status.kind === 'error' && (
          <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
            <p className="font-semibold">Couldn't open {status.fileName}</p>
            <p className="mt-1 text-muted-foreground">{status.message}</p>
            <div className="mt-3 flex items-center gap-4">
              <button type="button" onClick={dismissError} className="rounded-md border border-border px-2.5 py-1 hover:bg-accent">
                Dismiss
              </button>
              <a href={reportUrl(status)} target="_blank" rel="noreferrer" className="text-primary underline">
                Report this file
              </a>
            </div>
          </div>
        )}

        {log && status.kind !== 'loading' && <LogSummary log={log} />}
      </div>
    </main>
  );
}

function Progress({ fileName, progress }: { fileName: string; progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">Reading {fileName}…</span>
      <div
        role="progressbar"
        aria-label={`Reading ${fileName}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function LogSummary({ log }: { log: Log }) {
  const ts = log.timeSource;
  const timeLabel =
    ts.kind === 'index'
      ? 'Row number'
      : `${log.channels.find((c) => c.id === ts.channelId)?.name ?? 'Time'} (${UNIT_LABEL[ts.originalUnit]})`;
  const duration = log.time[log.rowCount - 1];

  return (
    <section className="flex flex-col gap-4" aria-label="Log summary">
      <h2 className="text-lg font-semibold">{log.fileName}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Rows</dt>
        <dd className="num" data-testid="row-count">
          {log.rowCount.toLocaleString('en-US')}
        </dd>
        <dt className="text-muted-foreground">Channels</dt>
        <dd className="num">{log.channels.length}</dd>
        <dt className="text-muted-foreground">Time axis</dt>
        <dd data-testid="time-source">{timeLabel}</dd>
        {ts.kind === 'column' && (
          <>
            <dt className="text-muted-foreground">Duration</dt>
            <dd className="num">{fmt(duration)} s</dd>
          </>
        )}
        <dt className="text-muted-foreground">Format</dt>
        <dd>
          {DELIMITER_NAMES[log.meta.delimiter] ?? log.meta.delimiter}-separated · decimal "{log.meta.decimal}" ·{' '}
          {log.meta.encoding}
        </dd>
        {log.meta.preamble.length > 0 && (
          <>
            <dt className="text-muted-foreground">File info</dt>
            <dd>{log.meta.preamble.join(' · ')}</dd>
          </>
        )}
      </dl>

      {log.meta.warnings.length > 0 && (
        <ul aria-label="Warnings" className="list-disc rounded-md border border-primary/40 bg-primary/10 py-3 pr-4 pl-8 text-sm">
          {log.meta.warnings.map((w) => (
            <li key={`${w.code}:${w.message}`}>{w.message}</li>
          ))}
        </ul>
      )}

      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-4 font-medium">Channel</th>
            <th className="pr-4 font-medium">Unit</th>
            <th className="pr-4 font-medium">Type</th>
            <th className="pr-4 text-right font-medium">Min</th>
            <th className="text-right font-medium">Max</th>
          </tr>
        </thead>
        <tbody>
          {log.channels.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="py-1 pr-4">{c.name}</td>
              <td className="pr-4 text-muted-foreground">{c.unit ?? ''}</td>
              <td className="pr-4">{c.kind}</td>
              <td className="num pr-4 text-right">{fmt(c.min)}</td>
              <td className="num text-right">{fmt(c.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

`src/App.tsx` — replace the `<main>…</main>` element with `<LoadScreen />` and add `import { LoadScreen } from '@/ui/LoadScreen';`.

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Write the E2E test (exercises the real worker in a browser)**

`tests/e2e/load.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('loads the demo sample through the worker', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Demo engine run' }).click();
  await expect(page.getByTestId('row-count')).toHaveText('9,600');
  await expect(page.getByTestId('time-source')).toHaveText('Time (seconds)');
  await expect(page.getByRole('cell', { name: 'Engine Speed', exact: true })).toBeVisible();
});

test('reads units and falls back to row numbers for the real-world export', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Open log').setInputFiles('tests/fixtures/autodata-sheet2.csv');
  await expect(page.getByTestId('time-source')).toHaveText('Row number');
  await expect(page.getByRole('row', { name: /Accelerator Position.*°TPS/ })).toBeVisible();
  await expect(page.getByText('No time column found')).toBeVisible();
});

test('shows a helpful error for a file with no numbers', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Open log').setInputFiles({
    name: 'names.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,colour\nfoo,red\nbar,blue\n'),
  });
  await expect(page.getByRole('alert')).toContainText('No numeric columns');
});
```

- [ ] **Step 6: Run the full check**

Run: `npm run lint && npm run typecheck && npx vitest run && npm run test:e2e`
Expected: all PASS (4 E2E tests including the smoke test).

- [ ] **Step 7: Manual large-file check**

Generate a 1M × 20 CSV (`node -e` loop writing to a temp file outside the repo), run `npm run dev`, open it, and confirm the progress bar moves, the page stays responsive, and the summary appears. Record the parse time in the PR description.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src tests
git add -A
git commit -m "feat: temporary load & inspect screen with end-to-end tests"
```

---

### Task 11: README, changelog and first deployment

**Files:**
- Modify: `README.md` (full rewrite)
- Create: `CHANGELOG.md`

**Interfaces:** none.

- [ ] **Step 1: Rewrite `README.md`**

````markdown
# DataLogViewer

Free, fast datalog viewer for CSV logs, right in your browser.

**Open it:** https://elvisokereke.github.io/datalogviewer/

- **Private.** Your log files never leave your computer: no server, no account, no tracking.
- **Fast.** Large logs are parsed in the background; built for files with 100k+ rows.
- **Forgiving.** Handles comma, semicolon and tab files, decimal commas, units rows, preambles and messy spreadsheet exports.

> **Status:** v0.1 in development. Charts, the channel list and the table view land next.

## Roadmap

- **v0.1, solid viewer:** synced multi-chart crosshair, zoom and pan, channel search, table view, themes.
- **v0.2, analyst:** calculated channels, scatter plots, range stats, markers, export.
- **v0.3+, MegaLogViewer rival:** RPM × MAP tables, log comparison, filters, more formats, offline install.

## Feedback

Found a file it can't read? [Open an issue](https://github.com/ElvisOkereke/datalogviewer/issues).

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173/datalogviewer/
npm test           # unit tests
npm run test:e2e   # end-to-end tests (builds first)
npm run sample     # regenerate public/samples/demo-run.csv
```

The original Flutter prototype is preserved at the `flutter-prototype` tag.

Free to use. © 2026 Elvis Okereke.
````

- [ ] **Step 2: Create `CHANGELOG.md`**

```markdown
# Changelog

## [Unreleased]

- Rebuilt as a browser app (TypeScript, React, Vite), deployed to GitHub Pages.
- CSV reader: delimiter, decimal-comma, preamble, header, units-row and time-column detection; windows-1252 fallback; parsing runs in a Web Worker.
- Temporary load & inspect screen with bundled sample logs.
```

- [ ] **Step 3: Commit**

```bash
npx prettier --write README.md CHANGELOG.md
git add README.md CHANGELOG.md
git commit -m "docs: rewrite README for the web app and start a changelog"
```

- [ ] **Step 4: STOP — confirm the outward steps with the user**

List exactly what happens next (push `main` + `flutter-prototype` tag, rename the repo to `datalogviewer`, push `web-rebuild` and open a PR, enable Pages with the GitHub Actions source, merge after CI passes) and wait for an explicit yes.

- [ ] **Step 5: Push the prototype state and rename the repo**

```bash
git push origin main
git push origin flutter-prototype
gh repo rename datalogviewer --yes
git remote -v
```
Expected: remote URLs now end in `datalogviewer.git` (gh updates `origin`; if not, `git remote set-url origin https://github.com/ElvisOkereke/datalogviewer.git`).

- [ ] **Step 6: Open the PR and wait for CI**

```bash
git push -u origin web-rebuild
gh pr create --base main --head web-rebuild --title "Web rebuild: foundation and data pipeline" --body "Plan A of the web rebuild. See docs/superpowers/plans/2026-10-17-plan-a-foundation-and-data.md."
gh pr checks --watch
```
Expected: the `check` job passes.

- [ ] **Step 7: Enable Pages with the Actions source**

```bash
gh api -X POST repos/ElvisOkereke/datalogviewer/pages -f build_type=workflow \
  || gh api -X PUT repos/ElvisOkereke/datalogviewer/pages -f build_type=workflow
```
Expected: JSON with `"build_type": "workflow"` (the PUT covers the case where Pages already exists).

- [ ] **Step 8: Merge and verify the deployment**

```bash
gh pr merge --merge --delete-branch
gh run watch "$(gh run list --workflow Deploy --limit 1 --json databaseId --jq '.[0].databaseId')"
curl -sI https://elvisokereke.github.io/datalogviewer/ | head -1
curl -s https://elvisokereke.github.io/datalogviewer/samples/demo-run.csv | head -2
```
Expected: Deploy run succeeds; `HTTP/2 200`; the CSV header and first row print.

---

## After Plan A

Plan B (Tier 1 UI) is written once this lands, against the real code. It covers spec §4.5 (charts), §6 (Workbench UI with shadcn/ui), §7 (interactions), §8 (persisted layout and re-binding), the rest of §9 (error boundaries, toasts) and §10 (component and full E2E tests), and it replaces `src/ui/LoadScreen.tsx`.
