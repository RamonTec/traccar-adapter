import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId,
} from '../logging/correlation-id.js';
import { runWithRequestContext } from './request-context.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { id?: unknown }, res: Response, next: () => void): void {
    const headerVal = res.getHeader(CORRELATION_ID_HEADER);
    const correlationId =
      typeof headerVal === 'string' && headerVal.length > 0
        ? headerVal
        : resolveCorrelationId(req.headers[CORRELATION_ID_HEADER]);

    runWithRequestContext({ correlationId }, next);
  }
}
