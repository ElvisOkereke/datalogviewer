import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

/**
 * Parses a file in a fresh Web Worker so large logs never block the UI. Aborting `signal`
 * terminates the worker; the promise then rejects and the caller ignores it.
 */
export function parseFileInWorker(
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<Log> {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<Log>((resolve, reject) => {
    const finish = () => {
      worker.terminate();
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new LogParseError('internal', 'Loading was cancelled.'));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        onProgress(msg.fraction);
        return;
      }
      finish();
      if (msg.type === 'done') resolve(msg.log);
      else reject(new LogParseError(msg.code, msg.message));
    };
    worker.onerror = (event) => {
      finish();
      reject(new LogParseError('internal', event.message || 'The file parser crashed.'));
    };
    worker.postMessage({ type: 'parse', file } satisfies WorkerRequest);
  });
}
