import { describe, expect, test, vi } from 'vitest';
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { createLogStore, SAMPLES, selectActiveLog, type ParseFn } from '@/state/logStore';

// Just enough of a Log for the store, which also resets the view and applies a layout.
const fakeLog = (id: string, fileName: string) =>
  ({
    id,
    fileName,
    time: Float64Array.of(0, 1),
    rowCount: 2,
    channels: [],
    timeSource: { kind: 'index' },
  }) as unknown as Log;
const file = (name: string) => new File(['x'], name);

describe('logStore', () => {
  test('loading a file reports progress, then makes it the active log', async () => {
    let finish!: (log: Log) => void;
    let report!: (f: number) => void;
    const parse: ParseFn = (_f, onProgress) => {
      report = onProgress;
      return new Promise((r) => (finish = r));
    };
    const store = createLogStore(parse);
    const done = store.getState().loadFile(file('a.csv'));
    expect(store.getState().status).toEqual({ kind: 'loading', fileName: 'a.csv', progress: 0 });
    report(0.5);
    expect(store.getState().status).toMatchObject({ progress: 0.5 });
    finish(fakeLog('A', 'a.csv'));
    await done;
    expect(store.getState().status).toEqual({ kind: 'idle' });
    expect(selectActiveLog(store.getState())?.id).toBe('A');
  });

  test('a new file replaces the previous log', async () => {
    const queue = [fakeLog('A', 'a.csv'), fakeLog('B', 'b.csv')];
    const store = createLogStore(async () => queue.shift()!);
    await store.getState().loadFile(file('a.csv'));
    await store.getState().loadFile(file('b.csv'));
    expect(Object.keys(store.getState().logs)).toEqual(['B']);
    expect(store.getState().activeLogId).toBe('B');
  });

  test('parse errors become an error status that can be dismissed', async () => {
    const store = createLogStore(async () => {
      throw new LogParseError('no-numeric-columns', 'No numeric columns');
    });
    await store.getState().loadFile(file('bad.csv'));
    expect(store.getState().status).toEqual({
      kind: 'error',
      fileName: 'bad.csv',
      code: 'no-numeric-columns',
      message: 'No numeric columns',
    });
    store.getState().dismissError();
    expect(store.getState().status).toEqual({ kind: 'idle' });
  });

  test('unexpected errors are reported as internal', async () => {
    const store = createLogStore(async () => {
      throw new Error('boom');
    });
    await store.getState().loadFile(file('x.csv'));
    expect(store.getState().status).toMatchObject({
      kind: 'error',
      code: 'internal',
      message: 'boom',
    });
  });

  test('loadSample fetches the bundled file and parses it', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('Time,RPM\n0,800'));
    const parse = vi.fn<ParseFn>(async (f) => fakeLog('S', f.name));
    const store = createLogStore(parse, fetchFn as unknown as typeof fetch);
    await store.getState().loadSample(SAMPLES[0]);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/samples\/demo-run\.csv$/);
    expect(parse.mock.calls[0][0].name).toBe('demo-run.csv');
    expect(selectActiveLog(store.getState())?.id).toBe('S');
  });

  test('a failed sample download is an error, not a hang', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }));
    const store = createLogStore(vi.fn<ParseFn>(), fetchFn as unknown as typeof fetch);
    await store.getState().loadSample(SAMPLES[0]);
    expect(store.getState().status).toMatchObject({ kind: 'error', code: 'internal' });
  });
});

describe('overlapping loads', () => {
  /** A parse function whose calls stay pending until the test settles them. */
  function controllableParse() {
    const calls: {
      file: File;
      signal: AbortSignal;
      progress: (f: number) => void;
      resolve: (log: Log) => void;
      reject: (e: unknown) => void;
    }[] = [];
    const parse: ParseFn = (file, progress, signal) =>
      new Promise((resolve, reject) => calls.push({ file, signal, progress, resolve, reject }));
    return { parse, calls };
  }

  test('a slower earlier load cannot replace the file opened last', async () => {
    const { parse, calls } = controllableParse();
    const store = createLogStore(parse);
    const first = store.getState().loadFile(file('slow.csv'));
    const second = store.getState().loadFile(file('fast.csv'));
    calls[1].resolve(fakeLog('FAST', 'fast.csv'));
    await second;
    calls[0].progress(0.9);
    calls[0].resolve(fakeLog('SLOW', 'slow.csv'));
    await first;
    expect(store.getState().activeLogId).toBe('FAST');
    expect(store.getState().status).toEqual({ kind: 'idle' });
  });

  test('progress and errors from an abandoned load are ignored', async () => {
    const { parse, calls } = controllableParse();
    const store = createLogStore(parse);
    const first = store.getState().loadFile(file('old.csv'));
    void store.getState().loadFile(file('new.csv'));
    calls[0].progress(0.7);
    expect(store.getState().status).toEqual({ kind: 'loading', fileName: 'new.csv', progress: 0 });
    calls[0].reject(new LogParseError('empty', 'old is empty'));
    await first;
    expect(store.getState().status).toMatchObject({ kind: 'loading', fileName: 'new.csv' });
  });

  test('starting a new load aborts the previous parse', () => {
    const { parse, calls } = controllableParse();
    const store = createLogStore(parse);
    void store.getState().loadFile(file('a.csv'));
    void store.getState().loadFile(file('b.csv'));
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
  });
});

describe('switching logs', () => {
  test('the view is reset before the new log becomes active (no stale cursor reaches readers)', async () => {
    const { useViewStore } = await import('@/state/viewStore');
    useViewStore.getState().resetForLog(Float64Array.from({ length: 9600 }, (_, i) => i));
    useViewStore.getState().pin(6700);
    const small = {
      ...fakeLog('SMALL', 's.csv'),
      time: Float64Array.of(0, 1),
      rowCount: 2,
      channels: [],
    } as unknown as Log;
    const store = createLogStore(async () => small);
    let cursorWhenActivated: number | null | undefined;
    const stop = store.subscribe((s, prev) => {
      if (s.activeLogId !== prev.activeLogId) cursorWhenActivated = useViewStore.getState().cursor;
    });
    await store.getState().loadFile(file('s.csv'));
    stop();
    expect(cursorWhenActivated).toBeNull();
  });
});
