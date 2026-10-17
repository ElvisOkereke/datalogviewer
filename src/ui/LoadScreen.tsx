import { useState, type DragEvent } from 'react';
import { REPO_URL } from '@/config';
import type { Log } from '@/data/types';
import {
  LARGE_FILE_BYTES,
  SAMPLES,
  selectActiveLog,
  useLogStore,
  type LoadStatus,
} from '@/state/logStore';

// TEMPORARY: proves the data pipeline end to end. Plan B replaces this with the Workbench UI.

const DELIMITER_NAMES: Record<string, string> = {
  ',': 'Comma',
  ';': 'Semicolon',
  '\t': 'Tab',
  '|': 'Pipe',
};
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
      !window.confirm(
        `"${file.name}" is ${mb} MB. Large logs take longer and use a lot of memory. Load it anyway?`,
      )
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

        {status.kind === 'loading' && (
          <Progress fileName={status.fileName} progress={status.progress} />
        )}

        {status.kind === 'error' && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm"
          >
            <p className="font-semibold">Couldn't open {status.fileName}</p>
            <p className="mt-1 text-muted-foreground">{status.message}</p>
            <div className="mt-3 flex items-center gap-4">
              <button
                type="button"
                onClick={dismissError}
                className="rounded-md border border-border px-2.5 py-1 hover:bg-accent"
              >
                Dismiss
              </button>
              <a
                href={reportUrl(status)}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
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
          {DELIMITER_NAMES[log.meta.delimiter] ?? log.meta.delimiter}-separated · decimal "
          {log.meta.decimal}" · {log.meta.encoding}
        </dd>
        {log.meta.preamble.length > 0 && (
          <>
            <dt className="text-muted-foreground">File info</dt>
            <dd>{log.meta.preamble.join(' · ')}</dd>
          </>
        )}
      </dl>

      {log.meta.warnings.length > 0 && (
        <ul
          aria-label="Warnings"
          className="list-disc rounded-md border border-primary/40 bg-primary/10 py-3 pr-4 pl-8 text-sm"
        >
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
