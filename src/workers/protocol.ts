import { LogParseError, type LogErrorCode } from '@/data/errors';
import type { Log } from '@/data/types';

export type WorkerRequest = { type: 'parse'; file: File };

export type WorkerResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; log: Log }
  | { type: 'error'; code: LogErrorCode; message: string };

export function transferablesOf(log: Log): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>([log.time.buffer as ArrayBuffer]);
  for (const ch of log.channels) if (ch.values) buffers.add(ch.values.buffer as ArrayBuffer);
  return [...buffers];
}

export function toErrorResponse(err: unknown): Extract<WorkerResponse, { type: 'error' }> {
  if (err instanceof LogParseError) return { type: 'error', code: err.code, message: err.message };
  if (err instanceof RangeError) {
    return {
      type: 'error',
      code: 'out-of-memory',
      message: 'This log is too large for the browser to hold in memory. Try a smaller file.',
    };
  }
  if (err instanceof Error) return { type: 'error', code: 'internal', message: err.message };
  return { type: 'error', code: 'internal', message: String(err) };
}
