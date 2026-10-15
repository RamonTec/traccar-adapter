import type { AuditLogPort } from '../../../../shared/application/ports/audit-log.port.js';
import type { ClockPort } from '../../../../shared/application/ports/clock.port.js';
import { runAudited } from '../../../../shared/application/run-audited.js';
import { type Device, isRetired } from '../../domain/device.js';
import {
  DeviceNotFoundError,
  DeviceRetiredError,
} from '../../domain/errors.js';
import type { TraccarDeviceStatusPort } from '../ports/traccar-device-status.port.js';

export interface SetDeviceStatusInput {
  deviceId: number;
  disabled: boolean;
  actor: string | undefined;
}

export interface SetDeviceStatusOutput {
  device: Device;
  changed: boolean;
}

export class SetDeviceStatusUseCase {
  constructor(
    private readonly traccar: TraccarDeviceStatusPort,
    private readonly audit: AuditLogPort,
    private readonly clock: ClockPort,
  ) {}

  execute(input: SetDeviceStatusInput): Promise<SetDeviceStatusOutput> {
    return runAudited(
      { audit: this.audit, clock: this.clock },
      {
        op: input.disabled ? 'device.disable' : 'device.enable',
        actor: input.actor,
        fields: { deviceId: input.deviceId },
        success: ({ changed }) => ({
          result: changed ? 'changed' : 'unchanged',
        }),
        failure: (err) => ({
          result:
            err instanceof DeviceRetiredError
              ? 'retired'
              : err instanceof DeviceNotFoundError
                ? 'not-found'
                : 'failed',
        }),
      },
      () => this.run(input),
    );
  }

  private async run(
    input: SetDeviceStatusInput,
  ): Promise<SetDeviceStatusOutput> {
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
