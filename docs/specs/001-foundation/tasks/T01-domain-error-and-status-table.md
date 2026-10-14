---
id: 001-T01
status: todo           # todo | doing | blocked | done
depends_on: []
covers: [AC-9, AC-11]
---

# 001-T01 — Add DomainError and error code ↔ HTTP status table

## Objetivo
Base de errores de dominio y tabla pura que traduce `code` ↔ status HTTP (ADR-0002 §3).

## Contexto (leer SOLO esto)
- `docs/standards/coding.md` (sección Errores)
- `docs/standards/testing.md`

## Contrato
```ts
// src/shared/domain/domain-error.ts  — sin imports de @nestjs
export abstract class DomainError extends Error {
  abstract readonly code: string;
  protected constructor(message: string); // this.name = new.target.name
}

// src/shared/infrastructure/http/error-http-status.ts
export const ERROR_HTTP_STATUS: Readonly<Record<string, number>> = {
  VALIDATION_ERROR: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  CONFLICT: 409, UPSTREAM_UNAVAILABLE: 503, INTERNAL_ERROR: 500,
};
export function httpStatusForCode(code: string): number | undefined;
export function codeForHttpStatus(status: number): string;
```

## Archivos a crear/modificar
- [ ] `src/shared/domain/domain-error.ts` (nuevo)
- [ ] `src/shared/domain/domain-error.spec.ts` (nuevo)
- [ ] `src/shared/infrastructure/http/error-http-status.ts` (nuevo)
- [ ] `src/shared/infrastructure/http/error-http-status.spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-9a** — Una subclase `class FooError extends DomainError { readonly code = 'FOO' }` creada con `'msg'` es `instanceof DomainError` y `Error`, con `name === 'FooError'`, `message === 'msg'`, `code === 'FOO'`.
- [ ] **AC-9b** — `httpStatusForCode` devuelve el status de cada código de la tabla y `undefined` para un código desconocido.
- [ ] **AC-11a** — `codeForHttpStatus(404) === 'NOT_FOUND'` y el inverso es correcto para todos los códigos de la tabla.
- [ ] **AC-11b** — `codeForHttpStatus` devuelve `'BAD_REQUEST'` para 4xx sin mapear (p.ej. 405, 413) e `'INTERNAL_ERROR'` para 5xx sin mapear (p.ej. 502).

## Fuera de alcance
- Exception filter (T05). Códigos de dominio concretos (specs futuros).

## Verificación
```bash
pnpm vitest run src/shared
pnpm check
```

## Handoff
