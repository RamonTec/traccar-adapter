import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type AuthenticatedRequest,
  PUBLIC_KEY,
  REQUIRED_ROLE_KEY,
  type ServiceRole,
} from './auth.decorators.js';
import { InvalidTokenError, JwtVerifier } from './jwt-verifier.js';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      PUBLIC_KEY,
      targets,
    );
    if (isPublic === true) {
      return true;
    }

    const requiredRole = this.reflector.getAllAndOverride<
      ServiceRole | undefined
    >(REQUIRED_ROLE_KEY, targets);
    if (requiredRole === undefined) {
      throw new ForbiddenException();
    }

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = BEARER_PATTERN.exec(req.headers.authorization ?? '');
    const token = match?.[1];
    if (token === undefined) {
      throw new UnauthorizedException();
    }

    let principal;
    try {
      principal = await this.verifier.verify(token);
    } catch (err: unknown) {
      if (err instanceof InvalidTokenError) {
        this.logger.warn(
          { reason: err.reason, msg: 'Rejected service token' },
          'Rejected service token',
        );
        throw new UnauthorizedException();
      }
      throw err;
    }

    if (!principal.roles.includes(requiredRole)) {
      throw new ForbiddenException();
    }

    req.actor = principal.actor;
    return true;
  }
}
