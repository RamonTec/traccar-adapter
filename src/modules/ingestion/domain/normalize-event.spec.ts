import { readFileSync } from 'node:fs';
import { normalizeEvent } from './normalize.js';
import type {
  DeviceEvent,
  NormalizeContext,
  NormalizeResult,
} from './telemetry-event.js';

// Fixtures are mutated freely to build invalid payloads.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fixture(): Json {
  return JSON.parse(
    readFileSync(
      new URL(
        '../../../../test/fixtures/traccar/event-alarm.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Json;
}

const ctx: NormalizeContext = {
  receivedAt: new Date('2026-10-15T19:20:25.000Z'),
  correlationId: 'cid-2',
};

function expectEvent(result: NormalizeResult): DeviceEvent {
  if (!result.ok)
    throw new Error(`expected ok, got ${result.rejection.detail}`);
  return result.event as DeviceEvent;
}

function expectRejection(result: NormalizeResult) {
  if (result.ok) throw new Error('expected rejection');
  return result.rejection;
}

describe('normalizeEvent', () => {
  it('AC-3/AC-10: real alarm fixture → device.event envelope', () => {
    const payload = fixture();

    const event = expectEvent(normalizeEvent(payload, ctx));

    expect(event).toEqual({
      id: `traccar-event-${payload.event.id}`,
      type: 'device.event',
      version: 1,
      source: 'traccar',
      occurredAt: new Date(payload.event.eventTime).toISOString(),
      receivedAt: '2026-10-15T19:20:25.000Z',
      correlationId: 'cid-2',
      data: {
        eventId: payload.event.id,
        eventType: payload.event.type,
        deviceId: payload.device.id,
        groupId: payload.device.groupId,
        eventTime: new Date(payload.event.eventTime).toISOString(),
        positionId: payload.event.positionId,
        attributes: payload.event.attributes,
      },
    });
    expect(event.data.eventType).toBe('alarm');
  });

  it.each([
    ['0', (p: Json) => (p.event.positionId = 0), null],
    ['absent', (p: Json) => delete p.event.positionId, null],
    ['null', (p: Json) => (p.event.positionId = null), null],
    ['12', (p: Json) => (p.event.positionId = 12), 12],
  ])('AC-3b: positionId %s → %j', (_, mutate, expected) => {
    const payload = fixture();
    mutate(payload);

    expect(expectEvent(normalizeEvent(payload, ctx)).data.positionId).toBe(
      expected,
    );
  });

  it('AC-4: device.groupId 0 → MISSING_GROUP', () => {
    const payload = fixture();
    payload.device.groupId = 0;

    expect(expectRejection(normalizeEvent(payload, ctx))).toEqual({
      reason: 'MISSING_GROUP',
      detail: 'device.groupId: missing',
    });
  });

  it('AC-5: event.type 42 → SCHEMA_MISMATCH naming the path without the value', () => {
    const payload = fixture();
    payload.event.type = 42;

    const rejection = expectRejection(normalizeEvent(payload, ctx));

    expect(rejection.reason).toBe('SCHEMA_MISMATCH');
    expect(rejection.detail).toContain('event.type');
    expect(rejection.detail).not.toContain('42');
  });

  it.each([
    ['type', ''],
    ['eventTime', 'nope'],
    ['id', 0],
  ])('AC-5: event.%s = %j → SCHEMA_MISMATCH', (field, value) => {
    const payload = fixture();
    payload.event[field] = value;

    const rejection = expectRejection(normalizeEvent(payload, ctx));

    expect(rejection.reason).toBe('SCHEMA_MISMATCH');
    expect(rejection.detail).toContain(`event.${field}`);
  });

  it('AC-7: event.deviceId ≠ device.id → SCHEMA_MISMATCH', () => {
    const payload = fixture();
    payload.event.deviceId = payload.device.id + 1;

    expect(expectRejection(normalizeEvent(payload, ctx))).toEqual({
      reason: 'SCHEMA_MISMATCH',
      detail: 'event.deviceId: mismatch',
    });
  });

  it('AC-8: eventTime in ISO UTC; position in the payload is ignored', () => {
    const payload = fixture();
    payload.event.eventTime = '2026-10-15T15:20:24.000-04:00';
    payload.position = 'not validated';

    const event = expectEvent(normalizeEvent(payload, ctx));

    expect(event.data.eventTime).toBe('2026-10-15T19:20:24.000Z');
    expect(event.occurredAt).toBe('2026-10-15T19:20:24.000Z');
  });

  it('AC-9: deterministic and does not mutate the input', () => {
    const payload = fixture();
    const before = structuredClone(payload);

    expect(normalizeEvent(payload, ctx)).toEqual(normalizeEvent(payload, ctx));
    expect(payload).toEqual(before);
  });
});
