---
spec: 002-service-auth
status: approved       # draft | approved
---

# 002 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| shared/infra | `src/shared/infrastructure/config/app-config.ts` | M | Sección `auth` en `AppConfig` + env Keycloak |
| test | `test/support/test-env.ts` | N | Env y `AppConfig` válidos para tests (crece con cada spec) |
| shared/infra | `src/shared/infrastructure/auth/jwt-verifier.ts` | N | Verificar JWT (jose): firma, iss, aud, exp/nbf, RS256 |
| shared/infra | `src/shared/infrastructure/auth/auth.decorators.ts` | N | `@RequireRole`, `@Public`, `@Actor` |
| shared/infra | `src/shared/infrastructure/auth/service-auth.guard.ts` | N | Guard global: 401/403, denegación por defecto, `req.actor` |
| shared/infra | `src/shared/infrastructure/logging/pino-http-options.ts` | M | `actor` en el log de request |
| shared/infra | `src/shared/infrastructure/http/health.controller.ts` | M | `@Public()` |
| raíz | `src/app.module.ts` | M | `JwtVerifier` + `APP_GUARD` |

Dependencia nueva: `jose` (^6).

## Contratos internos
```ts
// config/app-config.ts (extensión)
export interface AuthConfig { readonly issuerUrl: string; readonly audience: string }
export interface AppConfig { readonly port: number; readonly logLevel: LogLevel; readonly auth: AuthConfig }
// env: KEYCLOAK_ISSUER_URL (z.url(), obligatoria) · KEYCLOAK_AUDIENCE (default 'traccar-adapter')

// test/support/test-env.ts
export const TEST_ENV: Readonly<Record<string, string>>;           // todas las obligatorias con valores dummy
export function testConfig(overrides?: Partial<AppConfig>): AppConfig;

// auth/jwt-verifier.ts
export interface VerifiedPrincipal { readonly actor: string; readonly roles: readonly string[] }
export type InvalidTokenReason = 'MALFORMED' | 'SIGNATURE' | 'EXPIRED' | 'CLAIMS' | 'ALGORITHM' | 'JWKS_UNAVAILABLE';
export class InvalidTokenError extends Error { constructor(readonly reason: InvalidTokenReason) }
export class JwtVerifier {
  constructor(config: AuthConfig, getKey?: JWTVerifyGetKey); // default: createRemoteJWKSet(<issuer>/protocol/openid-connect/certs, { cooldownDuration: 30_000 })
  verify(token: string): Promise<VerifiedPrincipal>;         // jwtVerify({ issuer, audience, algorithms: ['RS256'], clockTolerance: 30 })
}                                                            // roles = payload.resource_access?.[audience]?.roles ?? []; actor = payload.azp

// auth/auth.decorators.ts
export type ServiceRole = 'groups:write' | 'devices:write';
export const RequireRole: (role: ServiceRole) => MethodDecorator & ClassDecorator;
export const Public: () => MethodDecorator & ClassDecorator;
export const Actor: () => ParameterDecorator;                // lee req.actor

// auth/service-auth.guard.ts
@Injectable() export class ServiceAuthGuard implements CanActivate { constructor(reflector: Reflector, verifier: JwtVerifier) }
```

## Flujo
1. Ruta `@Public()` → pasa.
2. Ruta sin `@RequireRole` → `ForbiddenException` (AC-7).
3. Sin `Authorization: Bearer` → `UnauthorizedException` (AC-1).
4. `verify` lanza `InvalidTokenError` → log `warn` con `reason` (nunca el token) → `UnauthorizedException` (AC-2/3/4/9).
5. Rol ausente → `ForbiddenException` (AC-5).
6. OK → `req.actor = principal.actor` → handler. pino-http añade `actor` al log de fin de request (AC-6).

El filtro de 001 ya traduce 401/403 a `UNAUTHORIZED` y `FORBIDDEN`.

## Decisiones
- `jose` en vez de passport-jwt: sin estrategias de Passport, caché de JWKS con enfriamiento incorporado (AC-8) y lista blanca de algoritmos.
- Guard **global** (`APP_GUARD`) con denegación por defecto: un endpoint nuevo sin anotar no queda abierto por descuido.
- `getKey` inyectable: los tests usan `createLocalJWKSet` con claves generadas, sin Keycloak.
- `test-env.ts` centraliza las variables obligatorias. Cada spec futuro añade las suyas ahí.

## Mapa AC → componentes
| AC | Componentes |
|----|-------------|
| 1, 5, 7 | service-auth.guard, auth.decorators |
| 2, 3, 4, 8, 9 | jwt-verifier |
| 6 | guard, auth.decorators (`@Actor`), pino-http-options |
| 10 | app-config |
| 11 | redacción existente (001) + verificación en e2e |
