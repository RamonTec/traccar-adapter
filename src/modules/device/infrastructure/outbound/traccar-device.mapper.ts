import type { Device } from '../../domain/device.js';

export interface TraccarDeviceDto {
  id: number;
  name: string;
  uniqueId: string;
  groupId: number;
  // Optional: Traccar may omit it on create responses (kept from 005).
  disabled?: boolean;
  [key: string]: unknown;
}

export function toDevice(dto: TraccarDeviceDto): Device {
  return {
    id: dto.id,
    uniqueId: dto.uniqueId,
    groupId: dto.groupId,
    name: dto.name,
    disabled: dto.disabled ?? false,
  };
}
