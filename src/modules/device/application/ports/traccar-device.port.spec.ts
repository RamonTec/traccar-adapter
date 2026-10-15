import { expectTypeOf } from 'vitest';
import {
  DeviceUniqueIdTakenError,
  TRACCAR_DEVICE_PORT,
  type TraccarDevicePort,
} from './traccar-device.port.js';

describe('TraccarDevicePort', () => {
  it('AC-11a: exposes exactly groupExists, findByUniqueId, create, and retire', () => {
    expectTypeOf<keyof TraccarDevicePort>().toEqualTypeOf<
      'groupExists' | 'findByUniqueId' | 'create' | 'retire'
    >();
  });

  it('AC-11b: retire operation only accepts deviceId and newUniqueId (no groupId)', () => {
    expectTypeOf<Parameters<TraccarDevicePort['retire']>>().toEqualTypeOf<
      [number, string]
    >();
  });

  it('defines TRACCAR_DEVICE_PORT symbol', () => {
    expect(typeof TRACCAR_DEVICE_PORT).toBe('symbol');
  });
});

describe('DeviceUniqueIdTakenError', () => {
  it('exposes uniqueId and has name DeviceUniqueIdTakenError', () => {
    const error = new DeviceUniqueIdTakenError('imei-123');

    expect(error).toBeInstanceOf(Error);
    expect(error.uniqueId).toBe('imei-123');
    expect(error.name).toBe('DeviceUniqueIdTakenError');
    expect(error.message).toBe('uniqueId imei-123 already taken in Traccar');
  });
});
