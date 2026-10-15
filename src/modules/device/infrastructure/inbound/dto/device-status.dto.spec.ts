import { deviceIdParamSchema, emptyBodySchema } from './device-status.dto.js';

describe('deviceIdParamSchema', () => {
  it('AC-6: parses a positive integer string to a number', () => {
    expect(deviceIdParamSchema.parse('18')).toBe(18);
  });

  it.each(['0', '-1', 'abc', '1.5', '99999999999999999999', '', '018'])(
    'AC-6: rejects %j',
    (value) => {
      expect(deviceIdParamSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('emptyBodySchema', () => {
  it.each([undefined, {}])('AC-9a: accepts %j', (value) => {
    expect(emptyBodySchema.safeParse(value).success).toBe(true);
  });

  it('AC-9a: rejects a body with properties', () => {
    expect(emptyBodySchema.safeParse({ x: 1 }).success).toBe(false);
  });
});
