import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import {
  Actor,
  RequireRole,
} from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { SetDeviceStatusUseCase } from '../../application/use-cases/set-device-status.use-case.js';
import {
  DeviceNotFoundError,
  DeviceRetiredError,
} from '../../domain/errors.js';
import {
  deviceIdParamSchema,
  emptyBodySchema,
} from './dto/device-status.dto.js';

type StatusOp = 'device.disable' | 'device.enable';
type AuditResult = 'changed' | 'unchanged' | 'retired' | 'not-found' | 'failed';

interface DeviceStatusResponse {
  deviceId: number;
  disabled: boolean;
}

@Controller('devices')
export class DeviceStatusController {
  private readonly logger = new Logger(DeviceStatusController.name);

  constructor(private readonly setStatus: SetDeviceStatusUseCase) {}

  @Post(':deviceId/disable')
  @HttpCode(200)
  @RequireRole('devices:write')
  disable(
    @Param('deviceId', new ZodValidationPipe(deviceIdParamSchema))
    deviceId: number,
    @Body(new ZodValidationPipe(emptyBodySchema)) _body: unknown,
    @Actor() actor: string | undefined,
  ): Promise<DeviceStatusResponse> {
    return this.run('device.disable', deviceId, true, actor);
  }

  @Post(':deviceId/enable')
  @HttpCode(200)
  @RequireRole('devices:write')
  enable(
    @Param('deviceId', new ZodValidationPipe(deviceIdParamSchema))
    deviceId: number,
    @Body(new ZodValidationPipe(emptyBodySchema)) _body: unknown,
    @Actor() actor: string | undefined,
  ): Promise<DeviceStatusResponse> {
    return this.run('device.enable', deviceId, false, actor);
  }

  private async run(
    op: StatusOp,
    deviceId: number,
    disabled: boolean,
    actor: string | undefined,
  ): Promise<DeviceStatusResponse> {
    const startedAt = performance.now();
    let result: AuditResult = 'failed';

    try {
      const output = await this.setStatus.execute({ deviceId, disabled });
      result = output.changed ? 'changed' : 'unchanged';
      return { deviceId: output.device.id, disabled: output.device.disabled };
    } catch (err) {
      if (err instanceof DeviceRetiredError) {
        result = 'retired';
      } else if (err instanceof DeviceNotFoundError) {
        result = 'not-found';
      }
      throw err;
    } finally {
      const audit = {
        msg: op,
        op,
        actor,
        deviceId,
        result,
        durationMs: Math.round(performance.now() - startedAt),
      };

      if (result === 'changed' || result === 'unchanged') {
        this.logger.log(audit);
      } else {
        this.logger.warn(audit);
      }
    }
  }
}
