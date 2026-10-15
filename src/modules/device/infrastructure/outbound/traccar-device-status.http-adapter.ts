import {
  type TraccarHttpClient,
  TraccarRequestError,
} from '../../../../shared/infrastructure/traccar/traccar-http-client.js';
import type { TraccarDeviceStatusPort } from '../../application/ports/traccar-device-status.port.js';
import type { Device } from '../../domain/device.js';
import { type TraccarDeviceDto, toDevice } from './traccar-device.mapper.js';

export class TraccarDeviceStatusHttpAdapter implements TraccarDeviceStatusPort {
  constructor(private readonly client: TraccarHttpClient) {}

  async get(deviceId: number): Promise<Device | undefined> {
    try {
      const dto = await this.client.request<TraccarDeviceDto>(
        'device.get',
        'GET',
        `/api/devices/${deviceId}`,
      );
      return toDevice(dto);
    } catch (error) {
      // Traccar answers an unknown/inaccessible device with 400, not 404.
      if (
        error instanceof TraccarRequestError &&
        error.status === 400 &&
        error.traccarMessage.toLowerCase().includes('access denied')
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async setDisabled(deviceId: number, disabled: boolean): Promise<void> {
    const raw = await this.client.request<Record<string, unknown>>(
      'device.get',
      'GET',
      `/api/devices/${deviceId}`,
    );

    // Full object: a PUT without groupId resets it to 0, without name → 400.
    await this.client.request<void>(
      'device.setDisabled',
      'PUT',
      `/api/devices/${deviceId}`,
      { body: { ...raw, disabled } },
    );
  }
}
