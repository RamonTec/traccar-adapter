import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  Actor,
  RequireRole,
} from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import {
  RegisterDeviceUseCase,
  type RegisterResult,
} from '../../application/use-cases/register-device.use-case.js';
import { DeviceAlreadyRegisteredError } from '../../domain/errors.js';
import {
  type RegisterDeviceDto,
  registerDeviceSchema,
} from './dto/register-device.dto.js';

type AuditResult = RegisterResult | 'conflict' | 'failed';

@Controller('devices')
export class DeviceController {
  private readonly logger = new Logger(DeviceController.name);

  constructor(private readonly registerDevice: RegisterDeviceUseCase) {}

  @Post()
  @RequireRole('devices:write')
  async register(
    @Body(new ZodValidationPipe(registerDeviceSchema)) dto: RegisterDeviceDto,
    @Actor() actor: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ deviceId: number; uniqueId: string; groupId: number }> {
    const startedAt = performance.now();
    let result: AuditResult = 'failed';
    let deviceId: number | undefined;
    let retiredDeviceId: number | undefined;

    try {
      const output = await this.registerDevice.execute({
        uniqueId: dto.uniqueId,
        name: dto.name,
        groupId: dto.groupId,
      });

      result = output.result;
      deviceId = output.device.id;
      retiredDeviceId = output.retiredDeviceId;

      res.status(output.result === 'existing' ? 200 : 201);
      return {
        deviceId: output.device.id,
        uniqueId: output.device.uniqueId,
        groupId: output.device.groupId,
      };
    } catch (err) {
      if (err instanceof DeviceAlreadyRegisteredError) {
        result = 'conflict';
      }
      throw err;
    } finally {
      const audit = {
        msg: 'device.register',
        op: 'device.register',
        actor,
        uniqueId: dto.uniqueId,
        groupId: dto.groupId,
        ...(deviceId !== undefined && { deviceId }),
        ...(retiredDeviceId !== undefined && { retiredDeviceId }),
        result,
        durationMs: Math.round(performance.now() - startedAt),
      };

      if (
        result === 'created' ||
        result === 'existing' ||
        result === 'retired-and-created'
      ) {
        this.logger.log(audit);
      } else {
        this.logger.warn(audit);
      }
    }
  }
}
