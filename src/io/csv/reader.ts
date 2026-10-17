import type { LogReader } from '../types';
import { decodeBytes } from './decode';
import { parseCsvText } from './parseCsv';

const EXTENSIONS = ['.csv', '.tsv', '.txt', '.log'];

export const csvReader: LogReader = {
  id: 'csv',
  extensions: EXTENSIONS,
  sniff(head, fileName) {
    if (head.includes(0)) return 0; // binary
    const dot = fileName.lastIndexOf('.');
    const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
    return EXTENSIONS.includes(ext) ? 0.9 : 0.5;
  },
  async parse(file, onProgress) {
    const { text, encoding } = decodeBytes(new Uint8Array(await file.arrayBuffer()));
    return parseCsvText(text, { fileName: file.name, encoding, onProgress });
  },
};
