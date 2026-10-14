---
id: 002-T03
status: todo           # todo | doing | blocked | done
depends_on: [002-T02]
covers: [AC-1, AC-5, AC-6, AC-7, AC-9]
---

# 002-T03 — Add auth decorators and ServiceAuthGuard

## Objetivo
Un guard que aplica ADR-0003 sobre cada ruta: `401` sin un token válido, `403` sin el rol, denegación por defecto, y la identidad del llamante (`actor`) disponible para el handler.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/auth/jwt-verifier.ts` (solo exports)
- `src/shared/infrastructure/http/http-exception.filter.ts` (solo cómo se registra)
- `test/support/test-env.ts`
- skill `automated-testing` (`recipes.md` §4)

## Contrato
```ts
// src/shared/infrastructure/auth/auth.decorators.ts
export type ServiceRole = 'groups:write' | 'devices:write';
export const REQUIRED_ROLE_KEY = 'auth:requiredRole';
export const PUBLIC_KEY = 'auth:public';
export const RequireRole = (role: ServiceRole) => SetMetadata(REQUIRED_ROLE_KEY, role);
export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().actor);

// src/shared/infrastructure/auth/service-auth.guard.ts
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly verifier: JwtVerifier) {}
  canActivate(ctx: ExecutionContext): Promise<boolean>;
}
// metadata: reflector.getAllAndOverride([handler, class])
// orden: Public → true · sin rol → ForbiddenException · sin "Bearer <t>" → UnauthorizedException
// · InvalidTokenError → logger.warn({ reason }, 'Rejected service token') + UnauthorizedException
// · rol ausente → ForbiddenException · ok → req.actor = principal.actor; true
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/auth/auth.decorators.ts` (nuevo)
- [ ] `src/shared/infrastructure/auth/service-auth.guard.ts` (nuevo)
- [ ] `src/shared/infrastructure/auth/service-auth.guard.spec.ts` (nuevo). App de prueba con `APP_GUARD` + `HttpExceptionFilter` y un `JwtVerifier` **fake** (objeto con `verify` programable). Controller dummy con `@Public() GET /open`, `@RequireRole('devices:write') GET /secured` (devuelve `@Actor()`) y `GET /unannotated`.

## Criterios de aceptación
- [ ] **AC-1** — `GET /secured` sin header, o con `Authorization: Basic x` → `401 UNAUTHORIZED`.
- [ ] **AC-9** — Si el verifier lanza `InvalidTokenError('JWKS_UNAVAILABLE')` → `401`, y hay un log `warn` con `reason`, sin el token.
- [ ] **AC-5** — Token válido con `roles: ['groups:write']` en `/secured` → `403 FORBIDDEN`.
- [ ] **AC-6** — Token válido con `devices:write` y `actor: 'core-service'` → `200` y el body es `'core-service'`.
- [ ] **AC-7** — `GET /unannotated` con un token válido → `403`; `GET /open` sin token → `200`.

## Fuera de alcance
- Registro global en `AppModule` y log de `actor` (T04).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/auth
pnpm check
```

## Handoff
