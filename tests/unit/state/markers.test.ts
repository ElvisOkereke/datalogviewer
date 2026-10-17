import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { logFingerprint, useMarkerStore } from '@/state/markers';

const logOf = (csv: string, fileName = 'run.csv') =>
  parseCsvText(csv, { fileName, encoding: 'utf-8' });
const run = logOf('Time (s),RPM\n0,800\n1,900\n2,1000');
const markers = () => useMarkerStore.getState();

beforeEach(() => {
  localStorage.clear();
  useMarkerStore.setState({ key: null, markers: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('logFingerprint', () => {
  test('the same data gives the same fingerprint', () => {
    expect(logFingerprint(run)).toBe(logFingerprint(logOf('Time (s),RPM\n0,800\n1,900\n2,1000')));
  });
  test('a different file with the same name gets a different fingerprint', () => {
    expect(logFingerprint(run)).not.toBe(
      logFingerprint(logOf('Time (s),RPM\n0,800\n1,900\n5,1000')),
    );
    expect(logFingerprint(run)).not.toBe(
      logFingerprint(logOf('Time (s),AFR\n0,800\n1,900\n2,1000')),
    );
  });
});

describe('marker store', () => {
  test('adding numbers markers and keeps them in time order', () => {
    markers().load(run);
    markers().add(1.5);
    markers().add(0.5);
    expect(markers().markers.map((m) => [m.t, m.label])).toEqual([
      [0.5, 'Marker 2'],
      [1.5, 'Marker 1'],
    ]);
  });

  test('rename and remove', () => {
    markers().load(run);
    const m = markers().add(1);
    markers().rename(m.id, 'Boost onset');
    expect(markers().markers[0].label).toBe('Boost onset');
    markers().remove(m.id);
    expect(markers().markers).toEqual([]);
  });

  test('markers come back when the same log is opened again, and not for another log', () => {
    markers().load(run);
    markers().add(1);
    useMarkerStore.setState({ key: null, markers: [] });
    markers().load(logOf('Time (s),RPM\n0,800\n1,900\n2,1000'));
    expect(markers().markers.map((m) => m.label)).toEqual(['Marker 1']);
    markers().load(logOf('Time (s),RPM\n0,1\n1,2\n2,3', 'other.csv'));
    expect(markers().markers).toEqual([]);
  });

  test('corrupt saved markers are ignored', () => {
    localStorage.setItem(`dlv.markers.${logFingerprint(run)}`, '{"not":"a list"}');
    markers().load(run);
    expect(markers().markers).toEqual([]);
  });

  test('saved markers carry a check digest, so a fingerprint collision loads nothing', () => {
    markers().load(run);
    markers().add(1);
    const key = `dlv.markers.${logFingerprint(run)}`;
    const saved = JSON.parse(localStorage.getItem(key)!) as { check: string };
    expect(saved.check).toMatch(/^[0-9a-f]{16}$/);
    expect(saved.check).not.toBe(logFingerprint(run));

    // Another log whose fingerprint happened to match would find this record under its key.
    localStorage.setItem(key, JSON.stringify({ ...saved, check: '0123456789abcdef' }));
    markers().load(run);
    expect(markers().markers).toEqual([]);
  });

  test('saved records hold no file names, and only the most recent 100 logs keep markers', () => {
    const csv = 'Time (s),RPM\n0,800\n1,900';
    for (let i = 0; i < 105; i++) {
      markers().load(logOf(csv, `private-${i}.csv`));
      markers().add(0.5);
    }
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('dlv.markers.'));
    expect(keys).toHaveLength(100);
    expect(keys.map((k) => localStorage.getItem(k)).join('')).not.toContain('private');
    // The oldest were dropped; the newest is still there.
    markers().load(logOf(csv, 'private-0.csv'));
    expect(markers().markers).toEqual([]);
    markers().load(logOf(csv, 'private-104.csv'));
    expect(markers().markers).toHaveLength(1);
  });

  test('the fingerprint is 64-bit (16 hex digits)', () => {
    expect(logFingerprint(run)).toMatch(/^[0-9a-f]{16}$/);
  });

  test('blocked storage never breaks adding a marker', () => {
    markers().load(run);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => markers().add(1)).not.toThrow();
    expect(markers().markers).toHaveLength(1);
  });
});
