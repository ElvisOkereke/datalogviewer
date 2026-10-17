import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDemoLog } from './demoLog';

const out = fileURLToPath(new URL('../public/samples/demo-run.csv', import.meta.url));
mkdirSync(dirname(out), { recursive: true });
const csv = generateDemoLog();
writeFileSync(out, csv, 'utf8');
console.log(`Wrote ${csv.trimEnd().split('\n').length - 1} rows to ${out}`);
