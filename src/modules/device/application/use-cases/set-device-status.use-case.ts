import { type Device, isRetired } from '../../domain/device.js';
import {
  DeviceNotFoundError,
  DeviceRetiredError,
} from '../../domain/errors.js';
import type { TraccarDeviceStatusPort } from '../ports/traccar-device-status.port.js';

export interface SetDeviceStatusInput {
  deviceId: number;
  disabled: boolean;
}

export interface SetDeviceStatusOutput {
  device: Device;
  changed: boolean;
}

export class SetDeviceStatusUseCase {
  constructor(private readonly traccar: TraccarDeviceStatusPort) {}

  async execute(input: SetDeviceStatusInput): Promise<SetDeviceStatusOutput> {
    const device = await this.traccar.get(input.deviceId);
    if (device === undefined) {
      throw new DeviceNotFoundError(input.deviceId);
    }

    // Idempotency first: disabling a retired (already disabled) device is a no-op.
    if (device.disabled === input.disabled) {
      return { device, changed: false };
    }

    if (!input.disabled && isRetired(device.uniqueId)) {
      throw new DeviceRetiredError(input.deviceId);
    }

    await this.traccar.setDisabled(input.deviceId, input.disabled);
    return { device: { ...device, disabled: input.disabled }, changed: true };
  }
}
