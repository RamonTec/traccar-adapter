import type { Device } from '../../domain/device.js';

export const TRACCAR_DEVICE_STATUS_PORT = Symbol('TraccarDeviceStatusPort');

export interface TraccarDeviceStatusPort {
  /** undefined = no existe o no es accesible para el usuario de servicio. */
  get(deviceId: number): Promise<Device | undefined>;
  /** Solo cambia `disabled`; conserva name, uniqueId, groupId y attributes (FR3, AC-7). */
  setDisabled(deviceId: number, disabled: boolean): Promise<void>;
}
