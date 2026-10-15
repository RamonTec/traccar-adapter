import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  Actor,
  RequireRole,
} from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { SetDeviceStatusUseCase } from '../../application/use-cases/set-device-status.use-case.js';
import {
  deviceIdParamSchema,
  emptyBodySchema,
} from './dto/device-status.dto.js';

interface DeviceStatusResponse {
  deviceId: number;
  disabled: boolean;
}

@Controller('devices')
export class DeviceStatusController {
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
    return this.run(deviceId, true, actor);
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
    return this.run(deviceId, false, actor);
  }

  // Auditing happens in the use case (ADR-0006); the controller only passes the actor.
  private async run(
    deviceId: number,
    disabled: boolean,
    actor: string | undefined,
  ): Promise<DeviceStatusResponse> {
    const { device } = await this.setStatus.execute({
      deviceId,
      disabled,
      actor,
    });
    return { deviceId: device.id, disabled: device.disabled };
  }
}
