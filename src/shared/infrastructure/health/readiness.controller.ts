import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import {
  ReadinessRegistry,
  type ReadinessStatus,
} from './readiness.registry.js';

export interface ReadinessResponse {
  readonly status: 'ok' | 'error';
  readonly checks: Record<string, ReadinessStatus>;
  readonly [info: string]: unknown;
}

@Public()
@Controller('health')
export class ReadinessController {
  constructor(private readonly registry: ReadinessRegistry) {}

  @Get('ready')
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponse> {
    const { ok, checks, info } = await this.registry.run();
    if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'error', checks, ...info };
  }
}
