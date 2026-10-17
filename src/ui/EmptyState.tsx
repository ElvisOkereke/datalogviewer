import { FileUp, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SAMPLES, useLogStore } from '@/state/logStore';

export function EmptyState({ onOpen }: { onOpen(): void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-dashed border-border p-8 text-center">
        <FileUp className="size-8 text-primary" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold">Open a CSV log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop a file anywhere in this window, or choose one.
          </p>
        </div>
        <Button onClick={onOpen}>Open log</Button>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground">Or try a sample log</span>
          <div className="flex flex-wrap justify-center gap-2">
            {SAMPLES.map((s) => (
              <Button
                key={s.path}
                variant="outline"
                size="sm"
                onClick={() => void useLogStore.getState().loadSample(s)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden />
          Your logs never leave your browser.
        </p>
      </div>
    </div>
  );
}
