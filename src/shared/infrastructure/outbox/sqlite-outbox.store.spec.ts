import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type NewOutboxEntry,
  OutboxFullError,
  SqliteOutboxStore,
} from './sqlite-outbox.store.js';

function entry(msgId: string, body = `{"id":"${msgId}"}`): NewOutboxEntry {
  return {
    subject: 'telemetry.events.position',
    msgId,
    correlationId: `cid-${msgId}`,
    body,
  };
}

describe('SqliteOutboxStore', () => {
  let dir: string;
  const stores: SqliteOutboxStore[] = [];

  function open(
    path = join(dir, 'outbox.db'),
    maxBytes = 1_048_576,
    clock?: () => number,
  ) {
    const store = new SqliteOutboxStore({ path, maxBytes }, clock);
    stores.push(store);
    return store;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'outbox-'));
  });

  afterEach(() => {
    for (const s of stores.splice(0)) s.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a FIFO queue', () => {
    const store = open();
    store.append(entry('a'));
    store.append(entry('b'));
    store.append(entry('c'));

    const first = store.oldest()!;
    expect(first).toMatchObject({
      subject: 'telemetry.events.position',
      msgId: 'a',
      correlationId: 'cid-a',
      body: '{"id":"a"}',
    });
    store.delete(first.seq);
    expect(store.oldest()?.msgId).toBe('b');
  });

  it('keeps an undefined correlationId as undefined', () => {
    const store = open();
    store.append({ ...entry('a'), correlationId: undefined });

    expect(store.oldest()?.correlationId).toBeUndefined();
  });

  it('AC-8: pending entries, order and byte count survive a reopen', () => {
    const path = join(dir, 'outbox.db');
    const first = open(path, 1_048_576);
    first.append(entry('a', 'x'.repeat(600_000)));
    first.append(entry('b'));
    first.close();
    stores.splice(stores.indexOf(first), 1);

    const reopened = open(path, 1_048_576);

    expect(reopened.stats().pending).toBe(2);
    expect(reopened.oldest()?.msgId).toBe('a');
    expect(() => reopened.append(entry('c', 'y'.repeat(600_000)))).toThrow(
      OutboxFullError,
    );
  });

  it('AC-2: non-ASCII bodies come back identical', () => {
    const store = open();
    const body = '{"name":"Camión ñandú 🚚"}';
    store.append(entry('a', body));

    expect(store.oldest()?.body).toBe(body);
  });

  it('AC-4/AC-10: an append over maxBytes throws OutboxFullError and stores nothing', () => {
    const store = open(join(dir, 'outbox.db'), 1_048_576);
    store.append(entry('a', 'x'.repeat(1_000_000)));

    expect(() => store.append(entry('b', 'y'.repeat(100_000)))).toThrow(
      OutboxFullError,
    );
    expect(store.stats().pending).toBe(1);
  });

  it('AC-4: isWritable is false once the limit is reached and true after deleting', () => {
    const store = open(join(dir, 'outbox.db'), 1_048_576);
    expect(store.isWritable()).toBe(true);

    store.append(entry('a', 'x'.repeat(1_048_576 - 20)));
    store.append(entry('b', 'y'.repeat(20)));
    expect(store.isWritable()).toBe(false);

    store.delete(store.oldest()!.seq);
    expect(store.isWritable()).toBe(true);
  });

  it('AC-11: stats report pending and the age of the oldest entry', () => {
    let now = 1_000;
    const store = open(join(dir, 'outbox.db'), 1_048_576, () => now);
    expect(store.stats()).toEqual({ pending: 0, oldestAgeMs: null });

    store.append(entry('a'));
    now = 1_500;
    store.append(entry('b'));
    now = 4_000;

    expect(store.stats()).toEqual({ pending: 2, oldestAgeMs: 3_000 });
  });

  it('creates the parent directory if needed and supports :memory:', () => {
    open(join(dir, 'nested', 'deeper', 'outbox.db')).append(entry('a'));
    const memory = open(':memory:');
    memory.append(entry('b'));

    expect(memory.stats().pending).toBe(1);
  });
});
