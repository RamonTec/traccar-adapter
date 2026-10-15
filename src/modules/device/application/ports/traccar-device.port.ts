import type { Device } from '../../domain/device.js';

export const TRACCAR_DEVICE_PORT = Symbol('TraccarDevicePort');

/** El POST de Traccar falló porque el uniqueId ya existe (carrera). */
export class DeviceUniqueIdTakenError extends Error {
  constructor(readonly uniqueId: string) {
    super(`uniqueId ${uniqueId} already taken in Traccar`);
    this.name = 'DeviceUniqueIdTakenError';
  }
}

export interface CreateDeviceCommand {
  uniqueId: string;
  name: string;
  groupId: number;
}

export interface TraccarDevicePort {
  groupExists(groupId: number): Promise<boolean>;
  findByUniqueId(uniqueId: string): Promise<Device | undefined>;
  create(input: CreateDeviceCommand): Promise<Device>;
  /** Solo cambia uniqueId; conserva groupId y disabled (FR3). */
  retire(deviceId: number, newUniqueId: string): Promise<void>;
}
