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
