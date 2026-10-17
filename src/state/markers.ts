import { create } from 'zustand';
import type { Log } from '@/data/types';

export interface Marker {
  id: string;
  /** Position on the log's time axis. */
  t: number;
  label: string;
}

const MAX_MARKERS = 500;
const MAX_LABEL_CHARS = 100;
const storageKey = (fingerprint: string) => `dlv.markers.${fingerprint}`;

/**
 * Identifies a log's data (not just its file name), so markers come back only for the same file:
 * FNV-1a over the name, row count, first/last time and channel headers.
 */
export function logFingerprint(log: Log): string {
  const n = log.rowCount;
  const text = [
    log.fileName,
    n,
    n ? log.time[0] : '',
    n ? log.time[n - 1] : '',
    log.channels
      .filter((c) => c.kind !== 'calculated')
      .map((c) => c.header)
      .join('\u0001'),
  ].join('\u0000');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const isMarker = (v: unknown): v is Marker =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Marker).id === 'string' &&
  typeof (v as Marker).t === 'number' &&
  Number.isFinite((v as Marker).t) &&
  typeof (v as Marker).label === 'string' &&
  (v as Marker).label.length <= MAX_LABEL_CHARS;

function read(key: string): Marker[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) && parsed.length <= MAX_MARKERS && parsed.every(isMarker)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function write(key: string | null, markers: Marker[]): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(markers));
  } catch {
    // Not remembered this time; the markers still work for this visit.
  }
}

const byTime = (a: Marker, b: Marker) => a.t - b.t;

/** The next free "Marker N" label (one past the highest N in use). */
function nextLabel(markers: Marker[]): string {
  const used = markers
    .map((m) => /^Marker (\d+)$/.exec(m.label)?.[1])
    .filter(Boolean)
    .map(Number);
  return `Marker ${used.length ? Math.max(...used) + 1 : markers.length + 1}`;
}

interface MarkerState {
  key: string | null;
  markers: Marker[];
  load(log: Log): void;
  add(t: number): Marker;
  rename(id: string, label: string): void;
  remove(id: string): void;
}

/** Markers for the active log, saved per log in localStorage. */
export const useMarkerStore = create<MarkerState>()((set, get) => {
  const commit = (markers: Marker[]) => {
    set({ markers });
    write(get().key, markers);
  };
  return {
    key: null,
    markers: [],
    load(log) {
      const key = storageKey(logFingerprint(log));
      set({ key, markers: read(key).sort(byTime) });
    },
    add(t) {
      const marker: Marker = {
        id: `m-${Math.random().toString(36).slice(2, 10)}`,
        t,
        label: nextLabel(get().markers),
      };
      if (get().markers.length < MAX_MARKERS) commit([...get().markers, marker].sort(byTime));
      return marker;
    },
    rename(id, label) {
      const clean = label.trim().slice(0, MAX_LABEL_CHARS);
      if (!clean) return;
      commit(get().markers.map((m) => (m.id === id ? { ...m, label: clean } : m)));
    },
    remove(id) {
      commit(get().markers.filter((m) => m.id !== id));
    },
  };
});
