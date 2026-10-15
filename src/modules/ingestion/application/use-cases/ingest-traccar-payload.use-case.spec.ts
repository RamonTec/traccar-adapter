import { readFileSync } from 'node:fs';
import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import * as normalize from '../../domain/normalize.js';
import { FakeDeadLetterPublisher } from '../ports/__fakes__/dead-letter-publisher.fake.js';
import { FakeEventPublisher } from '../ports/__fakes__/event-publisher.fake.js';
import {
  type IngestCommand,
  IngestTraccarPayloadUseCase,
} from './ingest-traccar-payload.use-case.js';

const fixtureText = readFileSync(
  new URL(
    '../../../../../test/fixtures/traccar/position.json',
    import.meta.url,
  ),
  'utf8',
);
const fixture = JSON.parse(fixtureText) as {
  device: { id: number; groupId: number };
  position: { fixTime: string };
};

const receivedAt = new Date('2026-10-15T19:20:20.000Z');

function command(
  body: string | Uint8Array,
  overrides: Partial<IngestCommand> = {},
): IngestCommand {
  return {
    kind: 'position',
    rawBody: typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
    oversized: false,
    receivedAt,
    correlationId: 'cid-1',
    ...overrides,
  };
}

describe('IngestTraccarPayloadUseCase', () => {
  let events: FakeEventPublisher;
  let deadLetters: FakeDeadLetterPublisher;
  let useCase: IngestTraccarPayloadUseCase;

  beforeEach(() => {
    events = new FakeEventPublisher();
    deadLetters = new FakeDeadLetterPublisher();
    useCase = new IngestTraccarPayloadUseCase(events, deadLetters);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC-2: valid position fixture is published', async () => {
    const outcome = await useCase.execute(command(fixtureText));

    const eventId = `traccar-position-${fixture.device.id}-${Date.parse(fixture.position.fixTime)}`;
    expect(outcome).toEqual({ outcome: 'published', eventId });
    expect(events.published).toHaveLength(1);
    expect(events.published[0]).toMatchObject({
      id: eventId,
      correlationId: 'cid-1',
      receivedAt: receivedAt.toISOString(),
    });
    expect(deadLetters.published).toEqual([]);
  });

  it('AC-3: truncated JSON → INVALID_JSON with the exact original bytes', async () => {
    const raw = Buffer.from('{"position":', 'utf8');

    const outcome = await useCase.execute(command(raw));

    expect(outcome).toEqual({
      outcome: 'deadlettered',
      reason: 'INVALID_JSON',
    });
    expect(deadLetters.published).toHaveLength(1);
    const dl = deadLetters.published[0]!;
    expect(dl).toMatchObject({
      kind: 'position',
      reason: 'INVALID_JSON',
      detail: 'invalid json',
      receivedAt,
      correlationId: 'cid-1',
    });
    expect(Buffer.compare(Buffer.from(dl.rawBody), raw)).toBe(0);
    expect(events.published).toEqual([]);
  });

  it('AC-3: invalid utf-8 bytes → INVALID_JSON (invalid utf-8)', async () => {
    const raw = new Uint8Array([0xff, 0xfe]);

    await useCase.execute(command(raw));

    expect(deadLetters.published[0]).toMatchObject({
      reason: 'INVALID_JSON',
      detail: 'invalid utf-8',
    });
    expect(
      Buffer.compare(
        Buffer.from(deadLetters.published[0]!.rawBody),
        Buffer.from(raw),
      ),
    ).toBe(0);
  });

  it('AC-4: groupId 0 → MISSING_GROUP in the dead-letter', async () => {
    const payload = JSON.parse(fixtureText) as typeof fixture;
    payload.device.groupId = 0;

    const outcome = await useCase.execute(command(JSON.stringify(payload)));

    expect(outcome).toEqual({
      outcome: 'deadlettered',
      reason: 'MISSING_GROUP',
    });
    expect(deadLetters.published[0]).toMatchObject({
      kind: 'position',
      reason: 'MISSING_GROUP',
      detail: 'device.groupId: missing',
    });
  });

  it('kind event uses normalizeEvent (position payload → SCHEMA_MISMATCH)', async () => {
    const outcome = await useCase.execute(
      command(fixtureText, { kind: 'event' }),
    );

    expect(outcome).toEqual({
      outcome: 'deadlettered',
      reason: 'SCHEMA_MISMATCH',
    });
    expect(deadLetters.published[0]?.kind).toBe('event');
  });

  it('AC-5: oversized → PAYLOAD_TOO_LARGE without parsing', async () => {
    const spy = vi.spyOn(JSON, 'parse');

    const outcome = await useCase.execute(
      command(fixtureText, { oversized: true }),
    );

    expect(outcome).toEqual({
      outcome: 'deadlettered',
      reason: 'PAYLOAD_TOO_LARGE',
    });
    expect(deadLetters.published[0]).toMatchObject({
      reason: 'PAYLOAD_TOO_LARGE',
      detail: 'body exceeds WEBHOOK_MAX_BODY_BYTES',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('AC-6: event publisher failure propagates and nothing is dead-lettered', async () => {
    const error = new UpstreamUnavailableError('nats');
    events.failWith = error;

    await expect(useCase.execute(command(fixtureText))).rejects.toBe(error);
    expect(deadLetters.published).toEqual([]);
  });

  it('AC-7: dead-letter failure propagates', async () => {
    const error = new UpstreamUnavailableError('nats');
    deadLetters.failWith = error;

    await expect(useCase.execute(command('{"position":'))).rejects.toBe(error);
  });

  it('AC-8: unexpected normalization error → PROCESSING_ERROR with error name', async () => {
    vi.spyOn(normalize, 'normalizePosition').mockImplementation(() => {
      throw new TypeError('boom with payload data');
    });

    const outcome = await useCase.execute(command(fixtureText));

    expect(outcome).toEqual({
      outcome: 'deadlettered',
      reason: 'PROCESSING_ERROR',
    });
    expect(deadLetters.published[0]).toMatchObject({
      reason: 'PROCESSING_ERROR',
      detail: 'TypeError',
    });
  });

  it('AC-1 (013): an event kept in the outbox → buffered with its eventId', async () => {
    events.delivery = 'buffered';

    const outcome = await useCase.execute(command(fixtureText));

    expect(outcome).toEqual({
      outcome: 'buffered',
      eventId: `traccar-position-${fixture.device.id}-${Date.parse(fixture.position.fixTime)}`,
    });
  });

  it('AC-2 (013): a dead-letter kept in the outbox → buffered with its reason', async () => {
    deadLetters.delivery = 'buffered';

    const outcome = await useCase.execute(command('{"position":'));

    expect(outcome).toEqual({ outcome: 'buffered', reason: 'INVALID_JSON' });
  });
});
