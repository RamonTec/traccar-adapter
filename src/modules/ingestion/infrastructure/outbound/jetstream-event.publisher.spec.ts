import { readFileSync } from 'node:fs';
import type {
  JetStreamPublisher,
  PublishOptions,
} from '../../../../shared/infrastructure/nats/jetstream.publisher.js';
import { SUBJECTS } from '../../../../shared/infrastructure/nats/stream-definitions.js';
import { normalizeEvent, normalizePosition } from '../../domain/normalize.js';
import type { TelemetryEvent } from '../../domain/telemetry-event.js';
import { JetStreamEventPublisher } from './jetstream-event.publisher.js';

class FakeJetStreamPublisher {
  readonly calls: {
    subject: string;
    payload: unknown;
    opts: PublishOptions;
  }[] = [];

  publish(subject: string, payload: unknown, opts: PublishOptions) {
    this.calls.push({ subject, payload, opts });
    return Promise.resolve({ stream: 'S', seq: 1, duplicate: false });
  }
}

function event(name: 'position' | 'event-alarm'): TelemetryEvent {
  const payload: unknown = JSON.parse(
    readFileSync(
      new URL(
        `../../../../../test/fixtures/traccar/${name}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const ctx = { receivedAt: new Date(0), correlationId: 'cid-7' };
  const result =
    name === 'position'
      ? normalizePosition(payload, ctx)
      : normalizeEvent(payload, ctx);
  if (!result.ok) throw new Error('fixture must normalize');
  return result.event;
}

describe('JetStreamEventPublisher', () => {
  let fake: FakeJetStreamPublisher;
  let publisher: JetStreamEventPublisher;

  beforeEach(() => {
    fake = new FakeJetStreamPublisher();
    publisher = new JetStreamEventPublisher(
      fake as unknown as JetStreamPublisher,
    );
  });

  it.each([
    ['position', SUBJECTS.position],
    ['event-alarm', SUBJECTS.deviceEvent],
  ] as const)('AC-2a: %s → %s with msgId = event.id', async (name, subject) => {
    const e = event(name);

    await publisher.publish(e);

    expect(fake.calls).toEqual([
      {
        subject,
        payload: e,
        opts: { msgId: e.id, correlationId: 'cid-7' },
      },
    ]);
  });
});
