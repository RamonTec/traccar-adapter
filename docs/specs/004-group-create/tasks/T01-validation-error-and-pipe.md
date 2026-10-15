---
id: 004-T01
status: done           # todo | doing | blocked | done
depends_on: [001]
covers: [AC-4]
---

# 004-T01 — Add ValidationError, ZodValidationPipe and error details in filter

## Objetivo
Un body inválido validado con un schema zod produce `400 { code: "VALIDATION_ERROR", message, correlationId, details: [...] }`.

## Contexto (leer SOLO esto)
- `src/shared/domain/domain-error.ts`
- `src/shared/infrastructure/http/http-exception.filter.ts`
- `src/shared/infrastructure/http/http-exception.filter.spec.ts`
- skill `automated-testing` (`recipes.md` §1 y §4)

## Contrato
```ts
// src/shared/domain/validation.error.ts
export interface ValidationIssue { path: string; message: string }
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  constructor(readonly details: ValidationIssue[]) { super('Validation failed'); }
}

// src/shared/infrastructure/http/zod-validation.pipe.ts
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T;   // safeParse; si falla → throw new ValidationError(issues)
}
// issue zod → { path: issue.path.join('.') || '(root)', message: issue.message }
```
Filtro: si `exception instanceof DomainError` y tiene `details` (array), el body incluye `details`. Sin `details`, el body queda igual que hoy (no añadir la clave).

## Archivos a crear/modificar
- [x] `src/shared/domain/validation.error.ts` (nuevo) + `.spec.ts`
- [x] `src/shared/infrastructure/http/zod-validation.pipe.ts` (nuevo) + `.spec.ts`
- [x] `src/shared/infrastructure/http/http-exception.filter.ts` (modificado) + ampliar `.spec.ts`

## Criterios de aceptación
- [x] **AC-4a** — `new ValidationError([...])` tiene `code === 'VALIDATION_ERROR'`, es `instanceof DomainError` y conserva `details`.
- [x] **AC-4b** — El pipe, con `z.object({ a: z.string() }).strict()`: `{a:'x'}` → devuelve el valor parseado; `{}` y `{a:'x', b:1}` → `ValidationError` con al menos un issue cuyo `path`/`message` no estén vacíos.
- [x] **AC-4c** — El filtro responde `400` con `details` para un `ValidationError`, y sin la clave `details` para otro `DomainError` (p.ej. `UpstreamUnavailableError` → 503).

## Fuera de alcance
- Schemas concretos de endpoints (T05). Mapeo `GROUP_NAME_AMBIGUOUS` (T02).

## Verificación
```bash
pnpm vitest run src/shared/domain src/shared/infrastructure/http
pnpm check
```

## Handoff
- `ValidationError` (`src/shared/domain/validation.error.ts`) exporta `ValidationIssue`; `details` es público.
- `ZodValidationPipe` mapea issues de raíz (p.ej. `unrecognized_keys` de `.strict()`) a `path: '(root)'`.
- El filtro añade `details` a cualquier `DomainError` con `details` array (vía `detailsOf`), no solo a `ValidationError`.
- Para T05: usar `new ZodValidationPipe(schema)` en `@Body(...)`; no hace falta tocar el filtro.
