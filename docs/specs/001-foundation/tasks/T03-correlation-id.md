---
id: 001-T03
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-5, AC-6]
---

# 001-T03 — Add correlation ID resolver

## Objetivo
Función pura que decide el correlation ID de una request: reutiliza el header si es válido, si no genera uno (ADR-0002 §1).

## Contexto (leer SOLO esto)
- `docs/standards/testing.md`

## Contrato
```ts
// src/shared/infrastructure/logging/correlation-id.ts
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export function resolveCorrelationId(
  header: string | string[] | undefined,
  generate?: () => string, // default: randomUUID de 'node:crypto'
): string;
```
Válido = `/^[A-Za-z0-9._-]{1,128}$/`. Si `header` es array se evalúa solo el primer elemento.

## Archivos a crear/modificar
- [x] `src/shared/infrastructure/logging/correlation-id.ts` (nuevo)
- [x] `src/shared/infrastructure/logging/correlation-id.spec.ts` (nuevo)

## Criterios de aceptación
- [x] **AC-5** — `resolveCorrelationId('abc-123_X.y')` → `'abc-123_X.y'` y no llama a `generate`.
- [x] **AC-5b** — `resolveCorrelationId(['first', 'second'])` → `'first'`.
- [x] **AC-6a** — `undefined`, `''`, `[]`, un valor de 129 chars, y valores con espacio, `/`, `\n` o `ñ` → devuelven el resultado de `generate` (inyectar un fake `() => 'gen'`).
- [x] **AC-6b** — Un valor de exactamente 128 chars válidos se reutiliza.
- [x] **AC-6c** — Sin `generate`, el resultado para `undefined` cumple el formato UUID v4.

## Fuera de alcance
- Integración con pino-http y header de respuesta (T04).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/logging/correlation-id.spec.ts
pnpm check
```

## Handoff
- Implementado `resolveCorrelationId` y constante `CORRELATION_ID_HEADER = 'x-correlation-id'`.
- Valida con regex `/^[A-Za-z0-9._-]{1,128}$/` sobre string o primer elemento de array; usa `randomUUID` por defecto.
- Listo para ser integrado en `pino-http` y cabeceras de respuesta en T04.

