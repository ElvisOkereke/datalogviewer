import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { OverviewStrip } from '@/charts/OverviewStrip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Log, ParseWarning } from '@/data/types';
import { bindLayout } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { LARGE_FILE_BYTES, selectActiveLog, useLogStore } from '@/state/logStore';
import { useViewStore } from '@/state/viewStore';
import { AboutDialog } from './AboutDialog';
import { DataTable } from './DataTable';
import { EmptyState } from './EmptyState';
import { ErrorBoundary } from './ErrorBoundary';
import { Inspector } from './Inspector';
import { LargeFileDialog } from './LargeFileDialog';
import { LoadFeedback } from './LoadFeedback';
import { PaneStack } from './PaneStack';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { useFileDrop } from './useFileDrop';
import { useShortcuts } from './useShortcuts';

/** Resets the view, applies a layout and summarises warnings whenever a new log becomes active. */
function useOnNewLog(log: Log | null, showWarnings: (w: ParseWarning[]) => void) {
  useEffect(() => {
    if (!log) return;
    useViewStore.getState().resetForLog(log.time);
    useLayoutStore.getState().ensureLayoutFor(log);
    const warnings = log.meta.warnings;
    if (warnings.length) {
      toast.warning(
        `${warnings.length} warning${warnings.length > 1 ? 's' : ''} reading ${log.fileName}`,
        {
          description: warnings[0].message,
          action: { label: 'Details', onClick: () => showWarnings(warnings) },
        },
      );
    }
  }, [log, showWarnings]);
}

function Workbench({ log }: { log: Log }) {
  const view = useLayoutStore((s) => s.view);
  const inspectorOpen = useLayoutStore((s) => s.inspectorOpen);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const panes = useLayoutStore((s) => s.panes);
  const overviewChannel = useMemo(() => {
    const bound = bindLayout({ ...useLayoutStore.getState(), panes }, log);
    return (
      bound[0]?.series.find((s) => s.channel)?.channel ??
      log.channels.find((c) => c.kind === 'numeric') ??
      null
    );
  }, [panes, log]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="shrink-0" style={{ width: sidebarWidth }}>
        <ErrorBoundary label="the channel list">
          <Sidebar log={log} />
        </ErrorBoundary>
      </div>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <ErrorBoundary label={view === 'chart' ? 'the charts' : 'the table'}>
            {view === 'chart' ? <PaneStack log={log} /> : <DataTable log={log} />}
          </ErrorBoundary>
        </div>
        {view === 'chart' && <OverviewStrip log={log} channel={overviewChannel} />}
      </main>
      {inspectorOpen && (
        <div className="w-64 shrink-0">
          <ErrorBoundary label="the Inspector">
            <Inspector log={log} />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const log = useLogStore(selectActiveLog);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingLarge, setPendingLarge] = useState<File | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [warnings, setWarnings] = useState<ParseWarning[] | null>(null);

  const openFile = useCallback((file: File) => {
    if (file.size > LARGE_FILE_BYTES) setPendingLarge(file);
    else void useLogStore.getState().loadFile(file);
  }, []);
  const dragging = useFileDrop(openFile);
  useShortcuts(useCallback(() => setShortcutsOpen(true), []));
  useOnNewLog(log, setWarnings);
  const chooseFile = () => inputRef.current?.click();

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Toolbar
        log={log}
        onOpen={chooseFile}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onShowAbout={() => setAboutOpen(true)}
      />
      <input
        ref={inputRef}
        type="file"
        aria-label="Open log"
        accept=".csv,.tsv,.txt,.log,text/csv"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) openFile(file);
          e.target.value = '';
        }}
      />
      {log ? (
        <ErrorBoundary label="the workbench">
          <Workbench log={log} />
        </ErrorBoundary>
      ) : (
        <EmptyState onOpen={chooseFile} />
      )}

      <LoadFeedback />
      <LargeFileDialog
        file={pendingLarge}
        onCancel={() => setPendingLarge(null)}
        onConfirm={(file) => {
          setPendingLarge(null);
          void useLogStore.getState().loadFile(file);
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <Dialog open={warnings !== null} onOpenChange={(o) => !o && setWarnings(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Warnings</DialogTitle>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {warnings?.map((w) => (
              <li key={`${w.code}:${w.message}`}>{w.message}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {dragging && (
        <div className="pointer-events-none fixed inset-2 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80 text-sm font-medium">
          Drop to open
        </div>
      )}
    </div>
  );
}
