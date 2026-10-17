import type { Log } from '@/data/types';

export interface LogReader {
  id: string;
  extensions: string[];
  /** Confidence 0..1 that this reader handles the file, from its first ~64 KB. */
  sniff(head: Uint8Array, fileName: string): number;
  parse(file: File, onProgress: (fraction: number) => void): Promise<Log>;
}
