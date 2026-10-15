import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

export type ServiceRole = 'groups:write' | 'devices:write';

export const REQUIRED_ROLE_KEY = 'auth:requiredRole';
export const PUBLIC_KEY = 'auth:public';

export interface AuthenticatedRequest extends Request {
  actor?: string;
}

export const RequireRole = (role: ServiceRole) =>
  SetMetadata(REQUIRED_ROLE_KEY, role);

export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const Actor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().actor,
);
