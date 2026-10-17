import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Menu } from 'lucide-react';
import { OverviewStrip } from '@/charts/OverviewStrip';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Log, ParseWarning } from '@/data/types';
import { bindLayout, migrateLayout, type PersistedLayout } from '@/state/layout';
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
import { downloadBlob } from './download';
import { parseLayoutFile, serializeLayout } from './layoutFile';
import { useFileDrop } from './useFileDrop';
import { useIsNarrow } from './useIsNarrow';
import { useShortcuts } from './useShortcuts';
import { useWorkbenchLog } from './useWorkbenchLog';

const MAX_LAYOUT_FILE_BYTES = 1024 * 1024;

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

function Workbench({
  log,
  calcErrors,
  narrow,
  channelsOpen,
  setChannelsOpen,
}: {
  log: Log;
  calcErrors: Record<string, string>;
  narrow: boolean;
  channelsOpen: boolean;
  setChannelsOpen(open: boolean): void;
}) {
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

  const setInspectorOpen = (open: boolean) => useLayoutStore.getState().setInspectorOpen(open);
  const main = (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <ErrorBoundary resetKey={log.id} label={view === 'chart' ? 'the charts' : 'the table'}>
          {view === 'chart' ? <PaneStack log={log} resizable={!narrow} /> : <DataTable log={log} />}
        </ErrorBoundary>
      </div>
      {view === 'chart' && <OverviewStrip log={log} channel={overviewChannel} />}
    </main>
  );

  if (narrow) {
    return (
      <div className="flex min-h-0 flex-1">
        {main}
        <Sheet open={channelsOpen} onOpenChange={setChannelsOpen}>
          <SheetContent side="left" className="w-72 gap-0 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Channels</SheetTitle>
            </SheetHeader>
            <Sidebar log={log} calcErrors={calcErrors} onPlotted={() => setChannelsOpen(false)} />
          </SheetContent>
        </Sheet>
        <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <SheetContent side="right" className="w-72 gap-0 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Inspector</SheetTitle>
            </SheetHeader>
            <ErrorBoundary resetKey={log.id} label="the Inspector">
              <Inspector log={log} />
            </ErrorBoundary>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="shrink-0" style={{ width: sidebarWidth }}>
        <ErrorBoundary resetKey={log.id} label="the channel list">
          <Sidebar log={log} calcErrors={calcErrors} />
        </ErrorBoundary>
      </div>
      {main}
      {inspectorOpen && (
        <div className="w-64 shrink-0">
          <ErrorBoundary resetKey={log.id} label="the Inspector">
            <Inspector log={log} />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  // Side effects of opening a file follow the raw log; views read the workbench log, which
  // also changes whenever a calculated channel is edited.
  const rawLog = useLogStore(selectActiveLog);
  const { log, calcErrors } = useWorkbenchLog();
  const inputRef = useRef<HTMLInputElement>(null);
  const layoutInputRef = useRef<HTMLInputElement>(null);
  const [pendingLayout, setPendingLayout] = useState<PersistedLayout | null>(null);
  const saveLayout = () =>
    downloadBlob(
      new Blob([serializeLayout(migrateLayout(useLayoutStore.getState()))], {
        type: 'application/json',
      }),
      'datalogviewer-layout.dlvlayout.json',
    );
  const openLayoutFile = async (file: File) => {
    // Real layout files are a few KB; refuse anything big before reading it.
    if (file.size > MAX_LAYOUT_FILE_BYTES) {
      toast.error('This layout file is too large.');
      return;
    }
    const layout = parseLayoutFile(await file.text());
    if (layout) setPendingLayout(layout);
    else toast.error("This isn't a DataLogViewer layout file.");
  };
  const [pendingLarge, setPendingLarge] = useState<File | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [warnings, setWarnings] = useState<ParseWarning[] | null>(null);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const narrow = useIsNarrow();

  const openFile = useCallback((file: File) => {
    if (file.size > LARGE_FILE_BYTES) setPendingLarge(file);
    else void useLogStore.getState().loadFile(file);
  }, []);
  const dragging = useFileDrop(openFile);
  useShortcuts(useCallback(() => setShortcutsOpen(true), []));
  useOnNewLog(rawLog, setWarnings);
  const chooseFile = () => inputRef.current?.click();

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Toolbar
        log={log}
        onOpen={chooseFile}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onShowAbout={() => setAboutOpen(true)}
        onSaveLayout={saveLayout}
        onOpenLayout={() => layoutInputRef.current?.click()}
        compact={narrow}
        leading={
          narrow && log ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Channels"
              className="size-8"
              onClick={() => setChannelsOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
          ) : null
        }
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
      <input
        ref={layoutInputRef}
        type="file"
        aria-label="Open layout file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openLayoutFile(file);
          e.target.value = '';
        }}
      />
      <AlertDialog open={pendingLayout !== null} onOpenChange={(o) => !o && setPendingLayout(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your current layout?</AlertDialogTitle>
            <AlertDialogDescription>
              The charts, calculated channels and scatter settings from the file will replace yours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingLayout) useLayoutStore.getState().replaceLayout(pendingLayout);
                setPendingLayout(null);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {log ? (
        <ErrorBoundary resetKey={log.id} label="the workbench">
          <Workbench
            log={log}
            calcErrors={calcErrors}
            narrow={narrow}
            channelsOpen={channelsOpen}
            setChannelsOpen={setChannelsOpen}
          />
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
