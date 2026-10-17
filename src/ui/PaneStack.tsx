import { MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { ChartPane } from '@/charts/ChartPane';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Log } from '@/data/types';
import { cn } from '@/lib/utils';
import { bindLayout, selectedPaneId, type BoundPane } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';
import { useViewStore } from '@/state/viewStore';
import { ErrorBoundary } from './ErrorBoundary';
import { CHANNEL_MIME } from './Sidebar';

const carriesChannel = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(CHANNEL_MIME);

/** Accepts channel drags from the sidebar; highlights while one hovers. */
function DropTarget({
  onChannel,
  className,
  children,
  ...rest
}: {
  onChannel(header: string): void;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string>) {
  const [over, setOver] = useState(false);
  return (
    <div
      {...rest}
      className={cn(className, over && 'ring-2 ring-primary ring-inset')}
      onDragOver={(e) => {
        if (!carriesChannel(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const header = e.dataTransfer.getData(CHANNEL_MIME);
        if (!header) return;
        e.preventDefault();
        onChannel(header);
      }}
    >
      {children}
    </div>
  );
}

function deletePane(id: string) {
  const { panes, removePane } = useLayoutStore.getState();
  const view = useViewStore.getState();
  if (view.focusedPaneId === id) {
    const i = panes.findIndex((p) => p.id === id);
    view.focusPane(panes[i - 1]?.id ?? panes[i + 1]?.id ?? null);
  }
  removePane(id);
}

function PaneMenu({ pane }: { pane: BoundPane }) {
  const { toggleSharedAxis, removeSeries } = useLayoutStore.getState();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Chart options"
        className="absolute top-1 right-1 z-10 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={pane.sharedAxis}
          onCheckedChange={() => toggleSharedAxis(pane.id)}
        >
          Shared axis
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem
          onSelect={() => pane.series.forEach((s) => removeSeries(pane.id, s.header))}
        >
          Clear
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => deletePane(pane.id)}>
          Delete chart
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddChart({ grow }: { grow: boolean }) {
  const add = (header?: string) => {
    const layout = useLayoutStore.getState();
    const id = layout.addPane();
    if (header) layout.addSeries(id, header);
    useViewStore.getState().focusPane(id);
  };
  return (
    <DropTarget onChannel={add} className={cn('p-1', grow ? 'flex-1' : 'shrink-0')}>
      <button
        type="button"
        onClick={() => add()}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-foreground',
          grow ? 'h-full' : 'h-9',
        )}
      >
        <Plus className="size-3.5" aria-hidden />
        Add chart
      </button>
    </DropTarget>
  );
}

export function PaneStack({ log, resizable = true }: { log: Log; resizable?: boolean }) {
  const layoutPanes = useLayoutStore((s) => s.panes);
  const focusedPaneId = useViewStore((s) => s.focusedPaneId);
  const panes = useMemo(
    () => bindLayout({ ...useLayoutStore.getState(), panes: layoutPanes }, log),
    [layoutPanes, log],
  );
  // Before anything is clicked, the first chart is the selected one (and the sidebar's target).
  const selectedId = selectedPaneId(layoutPanes, focusedPaneId);
  // Remount the group when panes come or go so it picks up the new default sizes.
  const groupKey = panes.map((p) => p.id).join('|');

  if (panes.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AddChart grow />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Group
        key={groupKey}
        orientation="vertical"
        disabled={!resizable}
        className="min-h-0 flex-1"
        defaultLayout={Object.fromEntries(panes.map((p) => [p.id, p.size]))}
        onLayoutChanged={(layout) => useLayoutStore.getState().setPaneSizes(layout)}
      >
        {panes.flatMap((pane, i) => [
          i > 0 && (
            <Separator
              key={`sep-${pane.id}`}
              className="h-1 shrink-0 bg-border transition-colors hover:bg-primary data-[separator=active]:bg-primary"
            />
          ),
          <Panel key={pane.id} id={pane.id} defaultSize={`${pane.size}%`} minSize={80}>
            <DropTarget
              data-testid="pane"
              data-pane-id={pane.id}
              className="relative h-full"
              onChannel={(header) => useLayoutStore.getState().addSeries(pane.id, header)}
            >
              <PaneMenu pane={pane} />
              <ErrorBoundary resetKey={log.id} label="this chart">
                <ChartPane pane={pane} log={log} focused={pane.id === selectedId} />
              </ErrorBoundary>
            </DropTarget>
          </Panel>,
        ])}
      </Group>
      <AddChart grow={false} />
    </div>
  );
}
