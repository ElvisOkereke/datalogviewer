import { EMPTY_LAYOUT, migrateLayout, type PersistedLayout } from '@/state/layout';

const MARKER = { app: 'DataLogViewer', kind: 'layout' } as const;

/** A shareable layout file: the persisted layout plus a marker identifying it. */
export function serializeLayout(layout: PersistedLayout): string {
  return JSON.stringify({ ...MARKER, ...layout }, null, 2);
}

/**
 * Reads a layout file. Returns null for anything that isn't a valid DataLogViewer layout of a
 * version this app understands (bad JSON, missing marker, future version, invalid content).
 */
export function parseLayoutFile(text: string): PersistedLayout | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { app, kind, ...rest } = raw as Record<string, unknown>;
  if (app !== MARKER.app || kind !== MARKER.kind) return null;
  const layout = migrateLayout(rest);
  // migrateLayout falls back to the empty layout on invalid input; a real empty layout is fine.
  if (layout === EMPTY_LAYOUT && JSON.stringify(rest) !== JSON.stringify(EMPTY_LAYOUT)) return null;
  return layout;
}
