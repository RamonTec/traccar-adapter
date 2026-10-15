import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import { type Device, retiredUniqueId } from '../../domain/device.js';
import {
  DeviceAlreadyRegisteredError,
  GroupNotFoundError,
} from '../../domain/errors.js';
import {
  DeviceUniqueIdTakenError,
  type TraccarDevicePort,
} from '../ports/traccar-device.port.js';

export interface RegisterDeviceInput {
  uniqueId: string;
  name: string;
  groupId: number;
}

export type RegisterResult = 'created' | 'existing' | 'retired-and-created';

export interface RegisterDeviceOutput {
  device: Device;
  result: RegisterResult;
  retiredDeviceId?: number;
}

export class RegisterDeviceUseCase {
  constructor(private readonly traccar: TraccarDevicePort) {}

  async execute(input: RegisterDeviceInput): Promise<RegisterDeviceOutput> {
    const groupExists = await this.traccar.groupExists(input.groupId);
    if (!groupExists) {
      throw new GroupNotFoundError(input.groupId);
    }

    const existing = await this.traccar.findByUniqueId(input.uniqueId);

    if (existing) {
      if (!existing.disabled) {
        if (existing.groupId === input.groupId) {
          return { device: existing, result: 'existing' };
        }
        throw new DeviceAlreadyRegisteredError(
          input.uniqueId,
          existing.groupId,
        );
      }

      await this.traccar.retire(
        existing.id,
        retiredUniqueId(input.uniqueId, existing.id),
      );

      try {
        const device = await this.traccar.create(input);
        return {
          device,
          result: 'retired-and-created',
          retiredDeviceId: existing.id,
        };
      } catch (error) {
        return this.handleCreateError(error, input);
      }
    }

    try {
      const device = await this.traccar.create(input);
      return { device, result: 'created' };
    } catch (error) {
      return this.handleCreateError(error, input);
    }
  }

  private async handleCreateError(
    error: unknown,
    input: RegisterDeviceInput,
  ): Promise<RegisterDeviceOutput> {
    if (error instanceof DeviceUniqueIdTakenError) {
      const reread = await this.traccar.findByUniqueId(input.uniqueId);
      if (reread && !reread.disabled) {
        if (reread.groupId === input.groupId) {
          return { device: reread, result: 'existing' };
        }
        throw new DeviceAlreadyRegisteredError(input.uniqueId, reread.groupId);
      }
      throw new UpstreamUnavailableError('traccar');
    }
    throw error;
  }
}
