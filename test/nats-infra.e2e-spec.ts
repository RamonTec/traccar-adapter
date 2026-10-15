import type { JetStreamManager } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/transport-node';
import { jetstream } from '@nats-io/jetstream';
import { connectTestNats, deleteStreamIfExists } from './support/nats.js';

const STREAM = 'SMOKE_TEST';
const SUBJECT = 'smoke.test.hello';

describe('NATS test infrastructure (e2e)', () => {
  let nc: NatsConnection;
  let jsm: JetStreamManager;

  beforeAll(async () => {
    ({ nc, jsm } = await connectTestNats());
    await deleteStreamIfExists(jsm, STREAM);
  });

  afterAll(async () => {
    if (jsm) await deleteStreamIfExists(jsm, STREAM);
    if (nc) await nc.close();
  });

  it('creates a stream, publishes, reads the message back and deletes it', async () => {
    await jsm.streams.add({ name: STREAM, subjects: [SUBJECT] });

    const ack = await jetstream(nc).publish(SUBJECT, 'hello', {
      msgID: 'smoke-1',
    });
    const msg = await jsm.streams.getMessage(STREAM, {
      last_by_subj: SUBJECT,
    });

    expect(ack.stream).toBe(STREAM);
    expect(msg?.string()).toBe('hello');

    await jsm.streams.delete(STREAM);
    await expect(jsm.streams.info(STREAM)).rejects.toThrow(/not found/i);
  });
});
