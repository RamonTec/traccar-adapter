import { Logger } from '@nestjs/common';
import type { PublishOptions } from '../../../../shared/infrastructure/nats/jetstream.publisher.js';
import type {
  Delivery,
  ReliablePublisher,
} from '../../../../shared/infrastructure/outbox/reliable.publisher.js';
import { SUBJECTS } from '../../../../shared/infrastructure/nats/stream-definitions.js';
import type { DeadLetterRequest } from '../../application/ports/dead-letter-publisher.port.js';
import { buildDeadLetterMessage } from './dead-letter-message.js';
import { JetStreamDeadLetterPublisher } from './jetstream-dead-letter.publisher.js';

class FakeReliablePublisher {
  delivery: Delivery = 'published';
  readonly calls: {
    subject: string;
    payload: unknown;
    opts: PublishOptions;
  }[] = [];
  failWith?: Error;

  publish(subject: string, payload: unknown, opts: PublishOptions) {
    if (this.failWith) return Promise.reject(this.failWith);
    this.calls.push({ subject, payload, opts });
    return Promise.resolve(this.delivery);
  }
}

const req: DeadLetterRequest = {
  kind: 'position',
  reason: 'INVALID_JSON',
  detail: 'invalid json',
  rawBody: Buffer.from('{"position":"secret-raw-value"'),
  receivedAt: new Date('2026-10-15T19:20:20.000Z'),
  correlationId: 'cid-3',
};

describe('JetStreamDeadLetterPublisher', () => {
  let fake: FakeReliablePublisher;
  let publisher: JetStreamDeadLetterPublisher;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    fake = new FakeReliablePublisher();
    publisher = new JetStreamDeadLetterPublisher(
      fake as unknown as ReliablePublisher,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes the ADR-0004 message on the dead-letter subject with msgId = id', async () => {
    await publisher.publish(req);

    const msg = buildDeadLetterMessage(req);
    expect(fake.calls).toEqual([
      {
        subject: SUBJECTS.deadLetter,
        payload: msg,
        opts: { msgId: msg.id, correlationId: 'cid-3' },
      },
    ]);
  });

  it('AC-6: logs an error with reason, kind and id, never the raw payload', async () => {
    await publisher.publish(req);

    const msg = buildDeadLetterMessage(req);
    expect(errorLog).toHaveBeenCalledWith(
      {
        reason: 'INVALID_JSON',
        kind: 'position',
        id: msg.id,
        delivery: 'published',
      },
      'Payload dead-lettered',
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
      'secret-raw-value',
    );
  });

  it('propagates publish failures (the webhook answers 503)', async () => {
    const error = new Error('nats down');
    fake.failWith = error;

    await expect(publisher.publish(req)).rejects.toBe(error);
  });

  it('AC-2 (013): returns buffered and logs it when the outbox keeps the message', async () => {
    fake.delivery = 'buffered';

    await expect(publisher.publish(req)).resolves.toBe('buffered');
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: 'buffered' }),
      'Payload dead-lettered',
    );
  });
});
