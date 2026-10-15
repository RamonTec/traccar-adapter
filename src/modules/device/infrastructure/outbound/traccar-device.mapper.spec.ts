import { toDevice } from './traccar-device.mapper.js';

describe('toDevice', () => {
  it('maps a Traccar DTO to a Device and drops non-domain fields', () => {
    const device = toDevice({
      id: 18,
      name: 'Truck 1',
      uniqueId: '123456789012345',
      groupId: 5,
      disabled: true,
      attributes: { a: 1 },
      calendarId: 0,
      status: 'online',
    });

    expect(device).toEqual({
      id: 18,
      name: 'Truck 1',
      uniqueId: '123456789012345',
      groupId: 5,
      disabled: true,
    });
  });

  it('defaults disabled to false when Traccar omits it', () => {
    expect(
      toDevice({ id: 1, name: 'n', uniqueId: 'u', groupId: 2 }).disabled,
    ).toBe(false);
  });
});
