---
id: 004-T02
status: done           # todo | doing | blocked | done
depends_on: [001]
covers: [AC-3]
---

# 004-T02 — Add Group domain type and GroupNameAmbiguousError (409)

## Objetivo
Existe el tipo de dominio `Group` y un `GroupNameAmbiguousError` que el filtro HTTP traduce a `409 GROUP_NAME_AMBIGUOUS`.

## Contexto (leer SOLO esto)
- `src/shared/domain/domain-error.ts`
- `src/shared/infrastructure/http/error-http-status.ts`
- `src/shared/infrastructure/http/error-http-status.spec.ts`
- `docs/standards/architecture.md` (sección "Convenciones de archivos")

## Contrato
```ts
// src/modules/group/domain/group.ts
export interface Group { readonly id: number; readonly name: string }

// src/modules/group/domain/errors.ts
import { DomainError } from '../../../shared/domain/domain-error.js';
export class GroupNameAmbiguousError extends DomainError {
  readonly code = 'GROUP_NAME_AMBIGUOUS';
  constructor(readonly name: string, readonly matches: number) {
    super(`${matches} groups named "${name}" exist in Traccar`);
  }
}

// src/shared/infrastructure/http/error-http-status.ts → añadir
GROUP_NAME_AMBIGUOUS: 409,
```
Ojo: `CODE_BY_STATUS` invierte el mapa. Añadir otro código con 409 no debe cambiar `codeForHttpStatus(409)`, que debe seguir siendo `'CONFLICT'`. Si el orden de inserción lo rompe, coloca la entrada **después** de `CONFLICT` o excluye los códigos de dominio de la inversión.

## Archivos a crear/modificar
- [x] `src/modules/group/domain/group.ts` (nuevo)
- [x] `src/modules/group/domain/errors.ts` (nuevo) + `errors.spec.ts`
- [x] `src/shared/infrastructure/http/error-http-status.ts` (modificado) + ampliar `.spec.ts`

## Criterios de aceptación
- [x] **AC-3a** — `new GroupNameAmbiguousError('acme', 2)`: `code === 'GROUP_NAME_AMBIGUOUS'`, `instanceof DomainError`, expone `name` y `matches`.
- [x] **AC-3b** — `httpStatusForCode('GROUP_NAME_AMBIGUOUS') === 409`, y `codeForHttpStatus(409)` sigue siendo `'CONFLICT'`.

## Fuera de alcance
- Port y use case (T03).

## Verificación
```bash
pnpm vitest run src/modules/group/domain src/shared/infrastructure/http/error-http-status.spec.ts
pnpm check
```

## Handoff
- La pista "colocar después de CONFLICT" no funcionaba (el `Map` invertido se queda con la última entrada). Se usó la otra opción: excluir los códigos de dominio de la inversión.
- `error-http-status.ts` exporta ahora `GENERIC_ERROR_HTTP_STATUS` (base de la inversión) y `ERROR_HTTP_STATUS` = genéricos + dominio. Los futuros códigos de dominio van solo en el segundo.
- `GroupNameAmbiguousError.name` sobrescribe `Error.name` (`'acme'` en lugar del nombre de la clase), como fija el contrato. Ojo en logs/serializers.
