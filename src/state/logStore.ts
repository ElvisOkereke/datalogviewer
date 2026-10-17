import { create } from 'zustand';
import { LogParseError, type LogErrorCode } from '@/data/errors';
import type { Log } from '@/data/types';
import { parseFileInWorker } from '@/workers/parseClient';
import { useLayoutStore } from './layoutStore';
import { useMarkerStore } from './markers';
import { useViewStore } from './viewStore';

export type ParseFn = (
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
) => Promise<Log>;

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
  return create<LogState>()((set) => {
    // Only the most recent load may touch state; starting a new one cancels the previous one.
    let current: AbortController | null = null;

    function begin(fileName: string): AbortController {
      current?.abort();
      const load = new AbortController();
      current = load;
      set({ status: { kind: 'loading', fileName, progress: 0 } });
      return load;
    }

    async function run(file: File, load: AbortController): Promise<void> {
      try {
        const log = await parse(
          file,
          (progress) => {
            if (current === load)
              set({ status: { kind: 'loading', fileName: file.name, progress } });
          },
          load.signal,
        );
        if (current !== load) return;
        // Reset the view before readers see the new log, so no stale cursor indexes its arrays.
        useViewStore.getState().resetForLog(log.time);
        useLayoutStore.getState().ensureLayoutFor(log);
        useMarkerStore.getState().load(log);
        // Tier 1 shows one log at a time; the map shape is kept for log comparison later.
        set({ logs: { [log.id]: log }, activeLogId: log.id, status: { kind: 'idle' } });
      } catch (err) {
        if (current !== load) return;
        const code = err instanceof LogParseError ? err.code : 'internal';
        set({ status: { kind: 'error', fileName: file.name, code, message: message(err) } });
      }
    }

    return {
      logs: {},
      activeLogId: null,
      status: { kind: 'idle' },

      loadFile(file) {
        return run(file, begin(file.name));
      },

      async loadSample(sample) {
        const load = begin(sample.fileName);
        let blob: Blob;
        try {
          const res = await fetchFn(`${import.meta.env.BASE_URL}${sample.path}`, {
            signal: load.signal,
          });
          if (!res.ok) throw new Error(`Couldn't download the sample log (HTTP ${res.status}).`);
          blob = await res.blob();
        } catch (err) {
          if (current !== load) return;
          set({
            status: {
              kind: 'error',
              fileName: sample.fileName,
              code: 'internal',
              message: message(err),
            },
          });
          return;
        }
        if (current !== load) return;
        await run(new File([blob], sample.fileName, { type: 'text/csv' }), load);
      },

      dismissError() {
        set({ status: { kind: 'idle' } });
      },
    };
  });
}

export const useLogStore = createLogStore(parseFileInWorker);

export const selectActiveLog = (s: LogState): Log | null =>
  s.activeLogId ? (s.logs[s.activeLogId] ?? null) : null;
