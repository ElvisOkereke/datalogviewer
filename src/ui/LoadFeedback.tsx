import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLogStore } from '@/state/logStore';
import { reportUrl } from './report';

/** Progress while a log is read, and the error card when reading fails. */
export function LoadFeedback() {
  const status = useLogStore((s) => s.status);

  if (status.kind === 'loading') {
    const pct = Math.round(status.progress * 100);
    return (
      <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-popover p-3 shadow-lg">
          <p className="mb-2 truncate text-sm">Reading {status.fileName}…</p>
          <div
            role="progressbar"
            aria-label={`Reading ${status.fileName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="fixed inset-x-0 top-16 z-40 flex justify-center px-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-lg border border-destructive/50 bg-popover p-4 text-sm shadow-lg"
        >
          <div className="flex items-start gap-2">
            <p className="flex-1 font-semibold">Couldn't open {status.fileName}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => useLogStore.getState().dismissError()}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-1 text-muted-foreground">{status.message}</p>
          <Button variant="link" size="sm" className="mt-1 h-auto p-0" asChild>
            <a href={reportUrl(status.code)} target="_blank" rel="noreferrer">
              Report this file
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
