import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

/** Parses a file in a fresh Web Worker so large logs never block the UI. */
export function parseFileInWorker(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<Log> {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<Log>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        onProgress(msg.fraction);
        return;
      }
      worker.terminate();
      if (msg.type === 'done') resolve(msg.log);
      else reject(new LogParseError(msg.code, msg.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new LogParseError('internal', event.message || 'The file parser crashed.'));
    };
    worker.postMessage({ type: 'parse', file } satisfies WorkerRequest);
  });
}
