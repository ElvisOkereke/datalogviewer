import { FolderOpen, Monitor, Moon, MoreHorizontal, PanelRight, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatTime } from '@/charts/buildOptions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Log } from '@/data/types';
import { cn } from '@/lib/utils';
import { useLayoutStore } from '@/state/layoutStore';
import { useTheme } from './useTheme';

const THEME_ICON = { system: Monitor, dark: Moon, light: Sun } as const;

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn('size-8', pressed && 'bg-accent text-foreground')}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Toolbar({
  log,
  onOpen,
  onShowShortcuts,
  onShowAbout,
  leading,
  compact = false,
}: {
  log: Log | null;
  onOpen(): void;
  onShowShortcuts(): void;
  onShowAbout(): void;
  /** Extra controls at the start (e.g. the channels drawer button on narrow screens). */
  leading?: ReactNode;
  /** Narrow screens: secondary actions move into the overflow menu. */
  compact?: boolean;
}) {
  const view = useLayoutStore((s) => s.view);
  const inspectorOpen = useLayoutStore((s) => s.inspectorOpen);
  const { pref, cycle } = useTheme();
  const ThemeIcon = THEME_ICON[pref];
  const duration = log && log.rowCount > 0 ? log.time[log.rowCount - 1] : null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
      {leading}
      <span className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
        <span className="size-3.5 rounded-sm bg-primary" aria-hidden />
        <span className={compact ? 'sr-only' : undefined}>DataLogViewer</span>
      </span>
      {log && (
        <span className="ml-2 min-w-0 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{log.fileName}</span>
          {!compact && (
            <>
              {' · '}
              <span className="num">{log.rowCount.toLocaleString('en-US')} rows</span>
              {log.timeSource.kind === 'column' && duration != null && (
                <span className="num"> · {formatTime(duration, log.timeSource)}</span>
              )}
            </>
          )}
        </span>
      )}
      <span className="flex-1" />
      {log && (
        <>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            aria-label="View"
            value={view}
            onValueChange={(v) => v && useLayoutStore.getState().setView(v as 'chart' | 'table')}
          >
            <ToggleGroupItem value="chart" className="px-3 text-xs">
              Chart
            </ToggleGroupItem>
            <ToggleGroupItem value="table" className="px-3 text-xs">
              Table
            </ToggleGroupItem>
          </ToggleGroup>
          {!compact && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs">
                  Layout
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => useLayoutStore.getState().resetLayout(log)}>
                  Reset layout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <IconButton
            label="Inspector"
            pressed={inspectorOpen}
            onClick={() => useLayoutStore.getState().setInspectorOpen(!inspectorOpen)}
          >
            <PanelRight className="size-4" />
          </IconButton>
        </>
      )}
      {!compact && (
        <IconButton label={`Theme: ${pref}`} onClick={cycle}>
          <ThemeIcon className="size-4" />
        </IconButton>
      )}
      {compact ? (
        <Button size="icon" className="size-8" aria-label="Open log" onClick={onOpen}>
          <FolderOpen className="size-4" />
        </Button>
      ) : (
        <Button size="sm" className="h-8" onClick={onOpen}>
          Open log
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {compact && log && (
            <DropdownMenuItem onSelect={() => useLayoutStore.getState().resetLayout(log)}>
              Reset layout
            </DropdownMenuItem>
          )}
          {compact && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                cycle();
              }}
            >
              <ThemeIcon className="size-4" /> Theme: {pref}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onShowShortcuts}>Keyboard shortcuts</DropdownMenuItem>
          <DropdownMenuItem onSelect={onShowAbout}>About</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
