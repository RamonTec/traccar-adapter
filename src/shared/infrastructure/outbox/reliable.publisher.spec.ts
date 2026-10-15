import { Logger } from '@nestjs/common';
import { UpstreamUnavailableError } from '../../domain/upstream-unavailable.error.js';
import type {
  JetStreamPublisher,
  PublishOptions,
} from '../nats/jetstream.publisher.js';
import type { OutboxDrainer } from './outbox.drainer.js';
import { ReliablePublisher } from './reliable.publisher.js';
import { SqliteOutboxStore } from './sqlite-outbox.store.js';

class FakeJetStream {
  readonly published: string[] = [];
  failWith?: Error;

  publish(_subject: string, _payload: unknown, opts: PublishOptions) {
    if (this.failWith) return Promise.reject(this.failWith);
    this.published.push(opts.msgId);
    return Promise.resolve({ stream: 'S', seq: 1, duplicate: false });
  }
}

const SUBJECT = 'telemetry.events.position';

describe('ReliablePublisher', () => {
  let js: FakeJetStream;
  let store: SqliteOutboxStore;
  let drainer: { kick: ReturnType<typeof vi.fn> };
  let publisher: ReliablePublisher;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  function build(maxBytes = 1_048_576) {
    store = new SqliteOutboxStore({ path: ':memory:', maxBytes });
    publisher = new ReliablePublisher(
      js as unknown as JetStreamPublisher,
      store,
      drainer as unknown as OutboxDrainer,
    );
  }

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    js = new FakeJetStream();
    drainer = { kick: vi.fn() };
    build();
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
  });

  it('AC-1: JetStream available → published, outbox untouched', async () => {
    await expect(
      publisher.publish(SUBJECT, { a: 1 }, { msgId: 'm1' }),
    ).resolves.toBe('published');

    expect(js.published).toEqual(['m1']);
    expect(store.stats().pending).toBe(0);
  });

  it('AC-1/AC-2: JetStream unavailable → buffered with the exact JSON and a drain kick', async () => {
    js.failWith = new UpstreamUnavailableError('nats');
    const payload = { name: 'Camión', n: 1 };

    await expect(
      publisher.publish(SUBJECT, payload, {
        msgId: 'm1',
        correlationId: 'cid-1',
      }),
    ).resolves.toBe('buffered');

    expect(store.oldest()).toMatchObject({
      subject: SUBJECT,
      msgId: 'm1',
      correlationId: 'cid-1',
      body: JSON.stringify(payload),
    });
    expect(drainer.kick).toHaveBeenCalledTimes(1);
  });

  it('AC-7: with pending messages, new ones queue behind them without calling JetStream', async () => {
    js.failWith = new UpstreamUnavailableError('nats');
    await publisher.publish(SUBJECT, {}, { msgId: 'm1' });
    js.failWith = undefined;

    await expect(publisher.publish(SUBJECT, {}, { msgId: 'm2' })).resolves.toBe(
      'buffered',
    );

    expect(js.published).toEqual([]);
    expect(store.stats().pending).toBe(2);
    expect(store.oldest()?.msgId).toBe('m1');
  });

  it('other JetStream errors propagate', async () => {
    js.failWith = new TypeError('bug');

    await expect(
      publisher.publish(SUBJECT, {}, { msgId: 'm1' }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(store.stats().pending).toBe(0);
  });

  it('AC-3/AC-4: outbox full → UpstreamUnavailableError(outbox) and an error log', async () => {
    js.failWith = new UpstreamUnavailableError('nats');
    store.close();
    build(1_048_576);
    store.append({
      subject: SUBJECT,
      msgId: 'filler',
      correlationId: undefined,
      body: 'x'.repeat(1_048_570),
    });

    const rejection = publisher.publish(
      SUBJECT,
      { big: 'y'.repeat(100) },
      {
        msgId: 'm1',
      },
    );

    await expect(rejection).rejects.toBeInstanceOf(UpstreamUnavailableError);
    await expect(rejection).rejects.toMatchObject({ upstream: 'outbox' });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', subject: SUBJECT }),
      'Outbox write failed',
    );
  });

  it('AC-11: logs each buffered message without the body', async () => {
    js.failWith = new UpstreamUnavailableError('nats');

    await publisher.publish(
      SUBJECT,
      { secret: 'payload-value' },
      { msgId: 'm1' },
    );

    expect(warn).toHaveBeenCalledWith(
      { id: 'm1', subject: SUBJECT },
      'Message buffered',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('payload-value');
  });
});
