import { isRetired, retiredUniqueId } from './device.js';

describe('retiredUniqueId', () => {
  it('AC-4: formats retired uniqueId with deviceId suffix', () => {
    expect(retiredUniqueId('123456789012345', 18)).toBe(
      '123456789012345:retired:18',
    );
  });
});

describe('isRetired', () => {
  it('AC-5a: recognises a retired uniqueId', () => {
    expect(isRetired('123456789012345:retired:18')).toBe(true);
  });

  it('AC-5a: an active uniqueId is not retired', () => {
    expect(isRetired('123456789012345')).toBe(false);
  });
});
