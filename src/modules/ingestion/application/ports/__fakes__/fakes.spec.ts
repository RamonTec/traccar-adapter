import { readFileSync } from 'node:fs';
import { normalizePosition } from '../../../domain/normalize.js';
import type { TelemetryEvent } from '../../../domain/telemetry-event.js';
import type { DeadLetterRequest } from '../dead-letter-publisher.port.js';
import { FakeDeadLetterPublisher } from './dead-letter-publisher.fake.js';
import { FakeEventPublisher } from './event-publisher.fake.js';

function anEvent(): TelemetryEvent {
  const payload: unknown = JSON.parse(
    readFileSync(
      new URL(
        '../../../../../../test/fixtures/traccar/position.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const result = normalizePosition(payload, {
    receivedAt: new Date(0),
    correlationId: 'cid',
  });
  if (!result.ok) throw new Error('fixture must normalize');
  return result.event;
}

function aDeadLetter(detail: string): DeadLetterRequest {
  return {
    kind: 'position',
    reason: 'INVALID_JSON',
    detail,
    rawBody: new Uint8Array([1, 2, 3]),
    receivedAt: new Date(0),
    correlationId: 'cid',
  };
}

describe('FakeEventPublisher', () => {
  it('records published events in order', async () => {
    const fake = new FakeEventPublisher();
    const first = anEvent();
    const second = { ...anEvent(), id: 'other' };

    await fake.publish(first);
    await fake.publish(second);

    expect(fake.published).toEqual([first, second]);
  });

  it('throws failWith without recording', async () => {
    const fake = new FakeEventPublisher();
    const error = new Error('down');
    fake.failWith = error;

    await expect(fake.publish(anEvent())).rejects.toBe(error);
    expect(fake.published).toEqual([]);
  });
});

describe('FakeDeadLetterPublisher', () => {
  it('records requests in order', async () => {
    const fake = new FakeDeadLetterPublisher();

    await fake.publish(aDeadLetter('a'));
    await fake.publish(aDeadLetter('b'));

    expect(fake.published.map((r) => r.detail)).toEqual(['a', 'b']);
  });

  it('throws failWith without recording', async () => {
    const fake = new FakeDeadLetterPublisher();
    const error = new Error('down');
    fake.failWith = error;

    await expect(fake.publish(aDeadLetter('a'))).rejects.toBe(error);
    expect(fake.published).toEqual([]);
  });
});
