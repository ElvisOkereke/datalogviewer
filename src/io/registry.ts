import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { csvReader } from './csv/reader';
import type { LogReader } from './types';

export const READERS: LogReader[] = [csvReader];

const HEAD_BYTES = 64 * 1024;

export async function readLog(file: File, onProgress: (fraction: number) => void): Promise<Log> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  let best: { reader: LogReader; score: number } | undefined;
  for (const reader of READERS) {
    const score = reader.sniff(head, file.name);
    if (score > 0 && (!best || score > best.score)) best = { reader, score };
  }
  if (!best) {
    throw new LogParseError(
      'unsupported',
      `DataLogViewer can't read "${file.name}". Supported formats: CSV, TSV and other delimited text logs.`,
    );
  }
  return best.reader.parse(file, onProgress);
}
