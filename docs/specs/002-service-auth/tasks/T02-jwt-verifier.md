---
id: 002-T02
status: done           # todo | doing | blocked | done
depends_on: [002-T01]
covers: [AC-2, AC-3, AC-4, AC-8, AC-9]
---

# 002-T02 — Add JwtVerifier with jose

## Objetivo
Verificar un JWT de Keycloak localmente y devolver la identidad del llamante y sus roles, o un error tipado con el motivo del rechazo.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts` (solo `AuthConfig`)
- skill `automated-testing` (SKILL.md + `recipes.md` §5 para el servidor JWKS falso)

## Contrato
```ts
// src/shared/infrastructure/auth/jwt-verifier.ts
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
export interface VerifiedPrincipal { readonly actor: string; readonly roles: readonly string[] }
export type InvalidTokenReason = 'MALFORMED' | 'SIGNATURE' | 'EXPIRED' | 'CLAIMS' | 'ALGORITHM' | 'JWKS_UNAVAILABLE';
export class InvalidTokenError extends Error { constructor(readonly reason: InvalidTokenReason) }
export class JwtVerifier {
  constructor(config: AuthConfig, getKey?: JWTVerifyGetKey);
  // default getKey: createRemoteJWKSet(new URL(`${issuerUrl}/protocol/openid-connect/certs`), { cooldownDuration: 30_000 })
  verify(token: string): Promise<VerifiedPrincipal>;
  // jwtVerify(token, getKey, { issuer, audience, algorithms: ['RS256'], clockTolerance: 30 })
  // roles = payload.resource_access?.[audience]?.roles ?? [] · actor = payload.azp (string obligatorio; si falta → CLAIMS)
}
```
Mapeo de errores de jose → `reason`: `JWSSignatureVerificationFailed`/`JWKSNoMatchingKey` → `SIGNATURE`; `JWTExpired` → `EXPIRED`; `JWTClaimValidationFailed` → `CLAIMS`; `JOSEAlgNotAllowed` → `ALGORITHM`; `JWSInvalid`/`JWTInvalid` → `MALFORMED`; fallo de red o timeout del JWKS → `JWKS_UNAVAILABLE`.

## Archivos a crear/modificar
- [x] `pnpm add jose`
- [x] `src/shared/infrastructure/auth/jwt-verifier.ts` (nuevo)
- [x] `src/shared/infrastructure/auth/jwt-verifier.spec.ts` (nuevo). Claves con `generateKeyPair('RS256')`; tokens con `new SignJWT(...)`; `getKey` = `createLocalJWKSet`, salvo en AC-8 y AC-9.

## Criterios de aceptación
- [x] **AC-2** — Firmado con otra clave → `SIGNATURE`; token mal formado (`'abc'`) → `MALFORMED`.
- [x] **AC-3** — `exp` 60 s en el pasado → `EXPIRED`; `exp` 10 s en el pasado → válido (tolerancia de 30 s); `nbf` 60 s en el futuro → rechazado.
- [x] **AC-4** — `iss` distinto o `aud` sin `traccar-adapter` → `CLAIMS`; token `HS256` → `ALGORITHM`.
- [x] **AC-4b** — Token válido → `{ actor: <azp>, roles: resource_access['traccar-adapter'].roles }`. Sin `resource_access` → `roles: []`.
- [x] **AC-8** — Con un servidor JWKS falso (puerto 0) y el `getKey` por defecto: dos verificaciones válidas seguidas hacen **1** petición al JWKS; un `kid` desconocido provoca como máximo 1 petición extra en 30 s.
- [x] **AC-9** — Con el JWKS caído (puerto cerrado) y sin caché → `JWKS_UNAVAILABLE`.

## Fuera de alcance
- Guard, decoradores y HTTP (T03).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/auth
pnpm check
```

## Handoff
- Implementado `JwtVerifier` y `InvalidTokenError` con `jose` según el contrato estricto en `src/shared/infrastructure/auth/jwt-verifier.ts`.
- Mapeo completo de errores de verificación de JWT y errores de JWKS (timeout, fallos de red/fetch, respuestas HTTP no-200) hacia `InvalidTokenReason`.
- Pruebas unitarias y de integración en `src/shared/infrastructure/auth/jwt-verifier.spec.ts` cubriendo AC-2, AC-3, AC-4, AC-4b, AC-8 y AC-9.
- T03 puede inyectar o instanciar `JwtVerifier` directamente en el `ServiceAuthGuard` usando `config.auth`.
