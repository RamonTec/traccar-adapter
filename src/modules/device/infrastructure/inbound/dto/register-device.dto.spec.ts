import { registerDeviceSchema } from './register-device.dto.js';

describe('registerDeviceSchema', () => {
  it.each([
    [
      '14-digit uniqueId',
      { uniqueId: '12345678901234', name: 'T', groupId: 1 },
    ],
    [
      '16-digit uniqueId',
      { uniqueId: '1234567890123456', name: 'T', groupId: 1 },
    ],
    [
      'uniqueId with letters',
      { uniqueId: '12345678901234a', name: 'T', groupId: 1 },
    ],
    ['empty name', { uniqueId: '123456789012345', name: '', groupId: 1 }],
    [
      'name over 128 chars',
      { uniqueId: '123456789012345', name: 'a'.repeat(129), groupId: 1 },
    ],
    ['groupId 0', { uniqueId: '123456789012345', name: 'T', groupId: 0 }],
    [
      'negative groupId',
      { uniqueId: '123456789012345', name: 'T', groupId: -1 },
    ],
    [
      'floating point groupId',
      { uniqueId: '123456789012345', name: 'T', groupId: 1.5 },
    ],
    [
      'string groupId',
      { uniqueId: '123456789012345', name: 'T', groupId: '5' },
    ],
    [
      'extra unknown field',
      { uniqueId: '123456789012345', name: 'T', groupId: 1, extra: true },
    ],
  ])('AC-7: rejects %s', (_label, value) => {
    expect(registerDeviceSchema.safeParse(value).success).toBe(false);
  });

  it('AC-7: accepts a valid payload', () => {
    const valid = {
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId: 5,
    };
    const result = registerDeviceSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(valid);
  });
});
