import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  Actor,
  RequireRole,
} from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { RegisterDeviceUseCase } from '../../application/use-cases/register-device.use-case.js';
import {
  type RegisterDeviceDto,
  registerDeviceSchema,
} from './dto/register-device.dto.js';

@Controller('devices')
export class DeviceController {
  constructor(private readonly registerDevice: RegisterDeviceUseCase) {}

  @Post()
  @RequireRole('devices:write')
  async register(
    @Body(new ZodValidationPipe(registerDeviceSchema)) dto: RegisterDeviceDto,
    @Actor() actor: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ deviceId: number; uniqueId: string; groupId: number }> {
    // Auditing happens in the use case (ADR-0006); the controller only passes the actor.
    const output = await this.registerDevice.execute({
      uniqueId: dto.uniqueId,
      name: dto.name,
      groupId: dto.groupId,
      actor,
    });
    res.status(output.result === 'existing' ? 200 : 201);
    return {
      deviceId: output.device.id,
      uniqueId: output.device.uniqueId,
      groupId: output.device.groupId,
    };
  }
}
