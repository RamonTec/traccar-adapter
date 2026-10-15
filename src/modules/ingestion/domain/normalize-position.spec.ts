import { readFileSync } from 'node:fs';
import { normalizePosition } from './normalize.js';
import type {
  NormalizeContext,
  NormalizeResult,
  PositionReported,
} from './telemetry-event.js';
import { knotsToKmh } from './units.js';

// Fixtures are mutated freely to build invalid payloads.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fixture(name: string): Json {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../../../test/fixtures/traccar/${name}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Json;
}

const ctx: NormalizeContext = {
  receivedAt: new Date('2026-10-15T19:20:20.123Z'),
  correlationId: 'cid-1',
};

function expectEvent(result: NormalizeResult): PositionReported {
  if (!result.ok)
    throw new Error(`expected ok, got ${result.rejection.detail}`);
  return result.event as PositionReported;
}

function expectRejection(result: NormalizeResult) {
  if (result.ok) throw new Error('expected rejection');
  return result.rejection;
}

describe('normalizePosition', () => {
  it('AC-1/AC-10: real fixture → position.reported envelope', () => {
    const payload = fixture('position');

    const event = expectEvent(normalizePosition(payload, ctx));

    const fixMs = Date.parse(payload.position.fixTime);
    expect(event).toMatchObject({
      id: `traccar-position-${payload.device.id}-${fixMs}`,
      type: 'position.reported',
      version: 1,
      source: 'traccar',
      occurredAt: new Date(fixMs).toISOString(),
      receivedAt: '2026-10-15T19:20:20.123Z',
      correlationId: 'cid-1',
    });
    expect(event.data).toMatchObject({
      positionId: null,
      deviceId: payload.device.id,
      groupId: payload.device.groupId,
      valid: payload.position.valid,
      latitude: payload.position.latitude,
      longitude: payload.position.longitude,
      altitude: payload.position.altitude,
      course: payload.position.course,
      accuracy: payload.position.accuracy,
    });
  });

  it('AC-1: a persisted position id (> 0) is kept in data.positionId', () => {
    const payload = fixture('position');
    payload.position.id = 12;

    expect(expectEvent(normalizePosition(payload, ctx)).data.positionId).toBe(
      12,
    );
  });

  it('AC-2: speed is converted from knots to km/h', () => {
    const payload = fixture('position');

    const event = expectEvent(normalizePosition(payload, ctx));

    expect(event.data.speedKmh).toBe(knotsToKmh(payload.position.speed));
  });

  it('AC-4: real fixture without group → MISSING_GROUP', () => {
    expect(
      expectRejection(normalizePosition(fixture('position-no-group'), ctx)),
    ).toEqual({ reason: 'MISSING_GROUP', detail: 'device.groupId: missing' });
  });

  it.each([
    ['null', (p: Json) => (p.device.groupId = null)],
    ['absent', (p: Json) => delete p.device.groupId],
    ['device absent', (p: Json) => delete p.device],
  ])('AC-4: groupId %s → MISSING_GROUP', (_, mutate) => {
    const payload = fixture('position');
    mutate(payload);

    expect(expectRejection(normalizePosition(payload, ctx)).reason).toBe(
      'MISSING_GROUP',
    );
  });

  it.each([null, 'text', 42, []])(
    'AC-4: non-object payload %j → MISSING_GROUP',
    (payload) => {
      expect(expectRejection(normalizePosition(payload, ctx)).reason).toBe(
        'MISSING_GROUP',
      );
    },
  );

  it('AC-5: wrong type → SCHEMA_MISMATCH naming the path without the value', () => {
    const payload = fixture('position');
    payload.position.latitude = 'x';

    const rejection = expectRejection(normalizePosition(payload, ctx));

    expect(rejection.reason).toBe('SCHEMA_MISMATCH');
    expect(rejection.detail).toContain('position.latitude');
    expect(rejection.detail).not.toContain('"x"');
    expect(rejection.detail).not.toMatch(/\bx\b/);
  });

  it('AC-5: missing position.id → SCHEMA_MISMATCH naming position.id', () => {
    const payload = fixture('position');
    delete payload.position.id;

    const rejection = expectRejection(normalizePosition(payload, ctx));

    expect(rejection.reason).toBe('SCHEMA_MISMATCH');
    expect(rejection.detail).toContain('position.id');
  });

  it('AC-5: detail lists at most 5 issues joined with "; "', () => {
    const payload = fixture('position');
    for (const key of [
      'id',
      'deviceId',
      'fixTime',
      'deviceTime',
      'serverTime',
      'valid',
      'latitude',
    ]) {
      delete payload.position[key];
    }

    const { detail } = expectRejection(normalizePosition(payload, ctx));

    expect(detail.split('; ')).toHaveLength(5);
  });

  it.each([
    ['latitude', 91],
    ['longitude', -181],
    ['fixTime', 'nope'],
  ])('AC-6: position.%s = %j → SCHEMA_MISMATCH', (field, value) => {
    const payload = fixture('position');
    payload.position[field] = value;

    const rejection = expectRejection(normalizePosition(payload, ctx));

    expect(rejection.reason).toBe('SCHEMA_MISMATCH');
    expect(rejection.detail).toContain(`position.${field}`);
  });

  it('AC-7: position.deviceId ≠ device.id → SCHEMA_MISMATCH', () => {
    const payload = fixture('position');
    payload.position.deviceId = payload.device.id + 1;

    expect(expectRejection(normalizePosition(payload, ctx))).toEqual({
      reason: 'SCHEMA_MISMATCH',
      detail: 'position.deviceId: mismatch',
    });
  });

  it('AC-8: dates are ISO UTC, unknown fields ignored, attributes copied', () => {
    const payload = fixture('position');
    payload.position.foo = 'bar';
    payload.position.fixTime = '2026-10-15T15:20:19.000-04:00';

    const event = expectEvent(normalizePosition(payload, ctx));

    for (const date of [
      event.occurredAt,
      event.receivedAt,
      event.data.fixTime,
      event.data.deviceTime,
      event.data.serverTime,
    ]) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(event.data.fixTime).toBe('2026-10-15T19:20:19.000Z');
    expect(event.data).not.toHaveProperty('foo');
    expect(event.data.attributes).toEqual(payload.position.attributes);
  });

  it('AC-8: missing accuracy/attributes default to 0 and {}', () => {
    const payload = fixture('position');
    delete payload.position.accuracy;
    delete payload.position.attributes;

    const event = expectEvent(normalizePosition(payload, ctx));

    expect(event.data.accuracy).toBe(0);
    expect(event.data.attributes).toEqual({});
  });

  it('AC-9: deterministic and does not mutate the input', () => {
    const payload = fixture('position');
    const before = structuredClone(payload);

    const first = normalizePosition(payload, ctx);
    const second = normalizePosition(payload, ctx);

    expect(first).toEqual(second);
    expect(payload).toEqual(before);
  });
});
