import type { DeadLetterRequest } from '../../application/ports/dead-letter-publisher.port.js';
import {
  buildDeadLetterMessage,
  DEAD_LETTER_MAX_DETAIL_CHARS,
  DEAD_LETTER_MAX_RAW_BYTES,
} from './dead-letter-message.js';

function request(
  rawBody: Uint8Array | string,
  overrides: Partial<DeadLetterRequest> = {},
): DeadLetterRequest {
  return {
    kind: 'position',
    reason: 'INVALID_JSON',
    detail: 'invalid json',
    rawBody: typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody,
    receivedAt: new Date('2026-10-15T19:20:20.123Z'),
    correlationId: 'cid-1',
    ...overrides,
  };
}

describe('buildDeadLetterMessage', () => {
  it('AC-2: id is a stable sha256 of the body', () => {
    const a = buildDeadLetterMessage(request('{"a":'));
    const b = buildDeadLetterMessage(request('{"a":'));
    const c = buildDeadLetterMessage(request('{"b":'));

    expect(a.id).toMatch(/^traccar-deadletter-[0-9a-f]{64}$/);
    expect(b.id).toBe(a.id);
    expect(c.id).not.toBe(a.id);
  });

  it('AC-3a: valid UTF-8 body is kept as utf8 text', () => {
    expect(buildDeadLetterMessage(request('{"a":'))).toMatchObject({
      rawPayload: '{"a":',
      rawEncoding: 'utf8',
      truncated: false,
    });
  });

  it('AC-3b: invalid UTF-8 bytes are kept as base64', () => {
    const bytes = new Uint8Array([0xff, 0x00, 0xfe]);

    const msg = buildDeadLetterMessage(request(bytes));

    expect(msg.rawEncoding).toBe('base64');
    expect(Buffer.from(msg.rawPayload, 'base64')).toEqual(Buffer.from(bytes));
  });

  it('AC-3c: bodies over 64 KiB are truncated but hashed in full', () => {
    const big = Buffer.alloc(100_000, 'a');
    const sameHead = Buffer.concat([
      big.subarray(0, DEAD_LETTER_MAX_RAW_BYTES),
      Buffer.alloc(100_000 - DEAD_LETTER_MAX_RAW_BYTES, 'b'),
    ]);

    const msg = buildDeadLetterMessage(request(big));

    expect(msg.truncated).toBe(true);
    expect(Buffer.byteLength(msg.rawPayload, 'utf8')).toBe(
      DEAD_LETTER_MAX_RAW_BYTES,
    );
    expect(buildDeadLetterMessage(request(sameHead)).id).not.toBe(msg.id);
  });

  it('AC-4: bearer tokens are redacted and detail is capped', () => {
    const redacted = buildDeadLetterMessage(
      request('x', { detail: 'header was Bearer abc.def.ghi here' }),
    );
    const long = buildDeadLetterMessage(
      request('x', { detail: 'd'.repeat(2000) }),
    );

    expect(redacted.detail).toContain('Bearer [REDACTED]');
    expect(redacted.detail).not.toContain('abc.def.ghi');
    expect(long.detail).toHaveLength(DEAD_LETTER_MAX_DETAIL_CHARS);
  });

  it('copies metadata with source traccar and ISO receivedAt', () => {
    expect(
      buildDeadLetterMessage(
        request('x', { kind: 'event', reason: 'MISSING_GROUP' }),
      ),
    ).toMatchObject({
      source: 'traccar',
      kind: 'event',
      reason: 'MISSING_GROUP',
      receivedAt: '2026-10-15T19:20:20.123Z',
      correlationId: 'cid-1',
    });
  });
});
