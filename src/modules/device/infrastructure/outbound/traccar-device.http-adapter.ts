import {
  type TraccarHttpClient,
  TraccarRequestError,
} from '../../../../shared/infrastructure/traccar/traccar-http-client.js';
import {
  type CreateDeviceCommand,
  DeviceUniqueIdTakenError,
  type TraccarDevicePort,
} from '../../application/ports/traccar-device.port.js';
import type { Device } from '../../domain/device.js';
import { type TraccarDeviceDto, toDevice } from './traccar-device.mapper.js';

interface TraccarGroupDto {
  id: number;
}

export class TraccarDeviceHttpAdapter implements TraccarDevicePort {
  constructor(private readonly client: TraccarHttpClient) {}

  async groupExists(groupId: number): Promise<boolean> {
    const groups = await this.client.request<TraccarGroupDto[]>(
      'group.list',
      'GET',
      '/api/groups',
    );
    return groups.some((g) => g.id === groupId);
  }

  async findByUniqueId(uniqueId: string): Promise<Device | undefined> {
    const devices = await this.client.request<TraccarDeviceDto[]>(
      'device.find',
      'GET',
      '/api/devices',
      { query: { uniqueId } },
    );
    const first = devices[0];
    return first ? toDevice(first) : undefined;
  }

  async create(input: CreateDeviceCommand): Promise<Device> {
    try {
      const dto = await this.client.request<TraccarDeviceDto>(
        'device.create',
        'POST',
        '/api/devices',
        {
          body: {
            name: input.name,
            uniqueId: input.uniqueId,
            groupId: input.groupId,
          },
        },
      );
      return toDevice(dto);
    } catch (error) {
      if (
        error instanceof TraccarRequestError &&
        error.status === 400 &&
        (error.traccarMessage.includes('UNIQUEID') ||
          error.traccarMessage.includes(
            'Unique index or primary key violation',
          ))
      ) {
        throw new DeviceUniqueIdTakenError(input.uniqueId);
      }
      throw error;
    }
  }

  async retire(deviceId: number, newUniqueId: string): Promise<void> {
    const raw = await this.client.request<Record<string, unknown>>(
      'device.get',
      'GET',
      `/api/devices/${deviceId}`,
    );

    await this.client.request<void>(
      'device.retire',
      'PUT',
      `/api/devices/${deviceId}`,
      {
        body: {
          ...raw,
          uniqueId: newUniqueId,
        },
      },
    );
  }
}
