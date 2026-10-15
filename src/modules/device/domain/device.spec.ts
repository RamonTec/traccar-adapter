import { retiredUniqueId } from './device.js';

describe('retiredUniqueId', () => {
  it('AC-4: formats retired uniqueId with deviceId suffix', () => {
    expect(retiredUniqueId('123456789012345', 18)).toBe(
      '123456789012345:retired:18',
    );
  });
});
