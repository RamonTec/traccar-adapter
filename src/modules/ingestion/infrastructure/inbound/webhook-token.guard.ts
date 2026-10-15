import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  APP_CONFIG,
  type AppConfig,
} from '../../../../shared/infrastructure/config/app-config.js';

const BEARER = /^Bearer (.+)$/;

const sha256 = (value: string): Buffer =>
  createHash('sha256').update(value, 'utf8').digest();

/** Shared-secret check for Traccar's forward (Traccar cannot send JWTs). */
@Injectable()
export class WebhookTokenGuard implements CanActivate {
  private readonly logger = new Logger(WebhookTokenGuard.name);
  private readonly expected: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.expected = sha256(config.webhook.token);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const header = ctx.switchToHttp().getRequest<Request>()
      .headers.authorization;
    const token = header?.match(BEARER)?.[1];
    if (token === undefined) {
      return this.reject('missing');
    }
    // Hashing first gives equal-length buffers, so timingSafeEqual never throws.
    if (!timingSafeEqual(sha256(token), this.expected)) {
      return this.reject('mismatch');
    }
    return true;
  }

  private reject(reason: 'missing' | 'mismatch'): never {
    this.logger.warn({ reason }, 'Rejected webhook token');
    throw new UnauthorizedException();
  }
}
