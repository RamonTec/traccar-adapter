import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId,
} from './correlation-id.js';

describe('correlation-id', () => {
  it('exports CORRELATION_ID_HEADER as x-correlation-id', () => {
    expect(CORRELATION_ID_HEADER).toBe('x-correlation-id');
  });

  it('AC-5: reuses a valid correlation ID header without calling generate', () => {
    const generate = vi.fn(() => 'gen-id');
    const result = resolveCorrelationId('abc-123_X.y', generate);

    expect(result).toBe('abc-123_X.y');
    expect(generate).not.toHaveBeenCalled();
  });

  it('AC-5b: uses only the first element when header is an array', () => {
    const generate = vi.fn(() => 'gen-id');
    const result = resolveCorrelationId(['first', 'second'], generate);

    expect(result).toBe('first');
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['empty array', []],
    ['129 characters string', 'a'.repeat(129)],
    ['string with space', 'invalid id'],
    ['string with slash', 'invalid/id'],
    ['string with newline', 'invalid\nid'],
    ['string with non-ascii character ñ', 'correlación'],
  ])('AC-6a: calls generate when header is invalid: %s', (_desc, input) => {
    const generate = vi.fn(() => 'fallback-id');
    const result = resolveCorrelationId(input, generate);

    expect(result).toBe('fallback-id');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('AC-6b: reuses a valid correlation ID of exactly 128 characters', () => {
    const valid128 = 'a'.repeat(128);
    const generate = vi.fn(() => 'gen-id');
    const result = resolveCorrelationId(valid128, generate);

    expect(result).toBe(valid128);
    expect(generate).not.toHaveBeenCalled();
  });

  it('AC-6c: generates a valid UUID v4 when generate is omitted and header is undefined', () => {
    const result = resolveCorrelationId(undefined);

    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(result).toMatch(uuidV4Regex);
  });
});
