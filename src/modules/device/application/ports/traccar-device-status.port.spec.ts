import { expectTypeOf } from 'vitest';
import {
  TRACCAR_DEVICE_STATUS_PORT,
  type TraccarDeviceStatusPort,
} from './traccar-device-status.port.js';

describe('TraccarDeviceStatusPort', () => {
  it('AC-7a: exposes exactly get and setDisabled', () => {
    expectTypeOf<keyof TraccarDeviceStatusPort>().toEqualTypeOf<
      'get' | 'setDisabled'
    >();
  });

  it('AC-7b: setDisabled only accepts deviceId and disabled', () => {
    expectTypeOf<
      Parameters<TraccarDeviceStatusPort['setDisabled']>
    >().toEqualTypeOf<[number, boolean]>();
  });

  it('defines TRACCAR_DEVICE_STATUS_PORT symbol', () => {
    expect(typeof TRACCAR_DEVICE_STATUS_PORT).toBe('symbol');
  });
});
