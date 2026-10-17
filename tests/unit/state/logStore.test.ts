import { describe, expect, test, vi } from 'vitest';
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { createLogStore, SAMPLES, selectActiveLog, type ParseFn } from '@/state/logStore';

const fakeLog = (id: string, fileName: string) => ({ id, fileName }) as Log;
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
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => new Response('Time,RPM\n0,800'));
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
