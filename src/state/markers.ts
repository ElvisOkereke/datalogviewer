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
const MAX_SAVED_LOGS = 100;
const KEY_PREFIX = 'dlv.markers.';
const storageKey = (fingerprint: string) => KEY_PREFIX + fingerprint;

/** The log's name, row count, first/last time and file headers, as one string to hash. */
function identityText(log: Log): string {
  const n = log.rowCount;
  return [
    log.fileName,
    n,
    n ? log.time[0] : '',
    n ? log.time[n - 1] : '',
    log.channels
      .filter((c) => c.kind !== 'calculated')
      .map((c) => c.header)
      .join('\u0001'),
  ].join('\u0000');
}

/** Two independent 32-bit passes (FNV-1a and a Murmur-style mix) as 16 hex digits. */
function hash64(text: string, fnvBasis: number, murSeed: number): string {
  let fnv = fnvBasis;
  let mur = murSeed;
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

/**
 * Identifies a log's data (not just its file name), so markers come back only for the same file:
 * a 64-bit hash over the name, row count, first/last time and channel headers.
 */
export function logFingerprint(log: Log): string {
  return hash64(identityText(log), 0x811c9dc5, 0x9747b28c);
}

/**
 * A second, independently seeded digest kept inside the record: a record is only shown for a log
 * whose key and check both match, and no file name is ever stored.
 */
const logCheck = (log: Log) => hash64(`check\u0000${identityText(log)}`, 0x050c5d1f, 0x2f9be6cc);

const isMarker = (v: unknown): v is Marker =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Marker).id === 'string' &&
  typeof (v as Marker).t === 'number' &&
  Number.isFinite((v as Marker).t) &&
  typeof (v as Marker).label === 'string' &&
  (v as Marker).label.length <= MAX_LABEL_CHARS;

interface SavedMarkers {
  check: string;
  /** For dropping the least recently used records beyond MAX_SAVED_LOGS. */
  savedAt: number;
  markers: Marker[];
}

function read(key: string, check: string): Marker[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<SavedMarkers> | null;
    const markers = saved?.check === check ? saved.markers : undefined;
    return Array.isArray(markers) && markers.length <= MAX_MARKERS && markers.every(isMarker)
      ? markers
      : [];
  } catch {
    return [];
  }
}

let lastSavedAt = 0;

/** Keeps markers for the most recently changed MAX_SAVED_LOGS logs only. */
function prune(keep: string): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(KEY_PREFIX) && k !== keep) keys.push(k);
  }
  if (keys.length < MAX_SAVED_LOGS) return;
  const savedAt = (k: string) => {
    try {
      const at = (JSON.parse(localStorage.getItem(k) ?? 'null') as Partial<SavedMarkers> | null)
        ?.savedAt;
      return typeof at === 'number' ? at : 0;
    } catch {
      return 0;
    }
  };
  const oldestFirst = keys.map((k) => [k, savedAt(k)] as const).sort((a, b) => a[1] - b[1]);
  for (const [k] of oldestFirst.slice(0, keys.length - (MAX_SAVED_LOGS - 1))) {
    localStorage.removeItem(k);
  }
}

function write(key: string | null, check: string | null, markers: Marker[]): void {
  if (!key || !check) return;
  try {
    lastSavedAt = Math.max(Date.now(), lastSavedAt + 1);
    const saved: SavedMarkers = { check, savedAt: lastSavedAt, markers };
    localStorage.setItem(key, JSON.stringify(saved));
    prune(key);
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
  check: string | null;
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
    write(get().key, get().check, markers);
  };
  return {
    key: null,
    check: null,
    markers: [],
    load(log) {
      const key = storageKey(logFingerprint(log));
      const check = logCheck(log);
      set({ key, check, markers: read(key, check).sort(byTime) });
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
