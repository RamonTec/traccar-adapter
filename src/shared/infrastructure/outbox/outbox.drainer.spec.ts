import { Logger } from '@nestjs/common';
import { UpstreamUnavailableError } from '../../domain/upstream-unavailable.error.js';
import type {
  JetStreamPublisher,
  PublishOptions,
} from '../nats/jetstream.publisher.js';
import { OutboxDrainer } from './outbox.drainer.js';
import { SqliteOutboxStore } from './sqlite-outbox.store.js';

class FakeJetStream {
  readonly published: {
    subject: string;
    payload: unknown;
    opts: PublishOptions;
  }[] = [];
  failures = 0;

  publish(subject: string, payload: unknown, opts: PublishOptions) {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new UpstreamUnavailableError('nats'));
    }
    this.published.push({ subject, payload, opts });
    return Promise.resolve({ stream: 'S', seq: 1, duplicate: false });
  }
}

describe('OutboxDrainer', () => {
  let store: SqliteOutboxStore;
  let js: FakeJetStream;
  let drainer: OutboxDrainer;
  let info: ReturnType<typeof vi.spyOn>;

  function seed(...ids: string[]) {
    for (const id of ids) {
      store.append({
        subject: 'telemetry.events.position',
        msgId: id,
        correlationId: `cid-${id}`,
        body: JSON.stringify({ id }),
      });
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    info = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    store = new SqliteOutboxStore({ path: ':memory:', maxBytes: 1_048_576 });
    js = new FakeJetStream();
    drainer = new OutboxDrainer(store, js as unknown as JetStreamPublisher);
  });

  afterEach(() => {
    drainer.onApplicationShutdown();
    store.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('AC-5: publishes pending messages in order with their msgId and deletes them', async () => {
    seed('a', 'b', 'c');

    drainer.kick();
    await vi.waitFor(() => expect(store.stats().pending).toBe(0));

    expect(js.published).toEqual(
      ['a', 'b', 'c'].map((id) => ({
        subject: 'telemetry.events.position',
        payload: { id },
        opts: { msgId: id, correlationId: `cid-${id}` },
      })),
    );
  });

  it('AC-6: retries with backoff (1 s, 2 s) and nothing is lost', async () => {
    seed('a');
    js.failures = 2;

    drainer.kick();
    await vi.advanceTimersByTimeAsync(0);
    expect(js.published).toEqual([]);
    await vi.advanceTimersByTimeAsync(999);
    expect(js.published).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(2000);

    expect(js.published.map((p) => p.opts.msgId)).toEqual(['a']);
    expect(store.stats().pending).toBe(0);
  });

  it('is single-flight: two kicks do not publish the same entry twice', async () => {
    seed('a', 'b');

    drainer.kick();
    drainer.kick();
    await vi.waitFor(() => expect(store.stats().pending).toBe(0));

    expect(js.published.map((p) => p.opts.msgId)).toEqual(['a', 'b']);
  });

  it('a kick while a retry is scheduled waits for the timer', async () => {
    seed('a');
    js.failures = 1;

    drainer.kick();
    await vi.advanceTimersByTimeAsync(0);
    drainer.kick();
    await vi.advanceTimersByTimeAsync(0);
    expect(js.published).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(js.published.map((p) => p.opts.msgId)).toEqual(['a']);
  });

  it('AC-8: drains pending entries on application bootstrap', async () => {
    seed('a');

    drainer.onApplicationBootstrap();
    await vi.waitFor(() => expect(store.stats().pending).toBe(0));
  });

  it('stops retrying after shutdown', async () => {
    seed('a');
    js.failures = 1;

    drainer.kick();
    await vi.advanceTimersByTimeAsync(0);
    drainer.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(js.published).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('AC-11: logs each delivered message without the body', async () => {
    seed('a');

    drainer.kick();
    await vi.waitFor(() => expect(store.stats().pending).toBe(0));

    expect(info).toHaveBeenCalledWith(
      { id: 'a', subject: 'telemetry.events.position', pending: 0 },
      'Buffered message delivered',
    );
  });
});
