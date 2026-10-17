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

/** What a saved record must match before its markers are shown (guards against key collisions). */
interface LogIdentity {
  fileName: string;
  rowCount: number;
  first: number | null;
  last: number | null;
}

/** JSON can't hold NaN/Infinity, so those are stored (and compared) as null. */
const finiteOrNull = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : null);

const identityOf = (log: Log): LogIdentity => ({
  fileName: log.fileName,
  rowCount: log.rowCount,
  first: finiteOrNull(log.rowCount ? log.time[0] : undefined),
  last: finiteOrNull(log.rowCount ? log.time[log.rowCount - 1] : undefined),
});

/**
 * Identifies a log's data (not just its file name), so markers come back only for the same file:
 * a 64-bit hash (two independent 32-bit passes) over the name, row count, first/last time and
 * channel headers.
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
  let fnv = 0x811c9dc5;
  let mur = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    fnv = Math.imul(fnv ^ c, 0x01000193);
    mur = Math.imul(mur ^ c, 0x5bd1e995);
    mur ^= mur >>> 15;
  }
  mur = Math.imul(mur ^ (mur >>> 13), 0xc2b2ae35);
  mur ^= mur >>> 16;
  const hex = (h: number) => (h >>> 0).toString(16).padStart(8, '0');
  return hex(fnv) + hex(mur);
}

const isMarker = (v: unknown): v is Marker =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Marker).id === 'string' &&
  typeof (v as Marker).t === 'number' &&
  Number.isFinite((v as Marker).t) &&
  typeof (v as Marker).label === 'string' &&
  (v as Marker).label.length <= MAX_LABEL_CHARS;

interface SavedMarkers extends LogIdentity {
  markers: Marker[];
}

function read(key: string, identity: LogIdentity): Marker[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<SavedMarkers> | null;
    const { markers } = saved ?? {};
    const sameLog =
      saved?.fileName === identity.fileName &&
      saved.rowCount === identity.rowCount &&
      saved.first === identity.first &&
      saved.last === identity.last;
    return sameLog &&
      Array.isArray(markers) &&
      markers.length <= MAX_MARKERS &&
      markers.every(isMarker)
      ? markers
      : [];
  } catch {
    return [];
  }
}

function write(key: string | null, identity: LogIdentity | null, markers: Marker[]): void {
  if (!key || !identity) return;
  try {
    const saved: SavedMarkers = { ...identity, markers };
    localStorage.setItem(key, JSON.stringify(saved));
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
  identity: LogIdentity | null;
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
    write(get().key, get().identity, markers);
  };
  return {
    key: null,
    identity: null,
    markers: [],
    load(log) {
      const key = storageKey(logFingerprint(log));
      const identity = identityOf(log);
      set({ key, identity, markers: read(key, identity).sort(byTime) });
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
