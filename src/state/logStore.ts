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
  {
    label: 'Real-world export',
    fileName: 'autodata-sheet2.csv',
    path: 'samples/autodata-sheet2.csv',
  },
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
        set({
          status: {
            kind: 'error',
            fileName: sample.fileName,
            code: 'internal',
            message: message(err),
          },
        });
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
