---
id: 001-T05
status: todo           # todo | doing | blocked | done
depends_on: [001-T01, 001-T04]
covers: [AC-9, AC-10, AC-11]
---

# 001-T05 — Add global HTTP exception filter

## Objetivo
Toda excepción que llegue al borde HTTP se responde con el cuerpo de ADR-0002 §3, sin filtrar detalles internos.

## Contexto (leer SOLO esto)
- `src/shared/domain/domain-error.ts`
- `src/shared/infrastructure/http/error-http-status.ts`
- `src/shared/infrastructure/logging/logging.module.ts`
- `test/support/log-capture.ts`
- `docs/standards/testing.md`

## Contrato
```ts
// src/shared/infrastructure/http/http-exception.filter.ts
export interface ErrorBody { code: string; message: string; correlationId: string; details?: unknown[] }
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void;
}
// correlationId = String(request.id)  (asignado por pino-http en T04)
// Mensajes genéricos por code: VALIDATION_ERROR 'Validation failed', UNAUTHORIZED 'Unauthorized',
// FORBIDDEN 'Forbidden', NOT_FOUND 'Resource not found', CONFLICT 'Conflict', BAD_REQUEST 'Bad request',
// UPSTREAM_UNAVAILABLE 'Upstream service unavailable', INTERNAL_ERROR 'Internal server error'
```
Orden de decisión:
1. `DomainError` con `httpStatusForCode(code)` definido → ese status, `{ code, message: error.message }`.
2. `DomainError` sin mapear → 500 `INTERNAL_ERROR` + `logger.error({ err, code }, 'Unmapped domain error code')`.
3. `HttpException` → `getStatus()`, `code = codeForHttpStatus(status)`, mensaje genérico del code.
4. Otro → 500 `INTERNAL_ERROR` + `logger.error({ err: exception }, 'Unhandled exception')`.

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/http/http-exception.filter.ts` (nuevo)
- [ ] `src/shared/infrastructure/http/http-exception.filter.spec.ts` (nuevo) — app de prueba: `LoggingModule.forRoot(cfg, capture.stream)`, `{ provide: APP_FILTER, useClass: HttpExceptionFilter }`, controller dummy en el spec con rutas que lanzan cada caso; `app.useLogger(app.get(Logger))`; supertest con `x-correlation-id: cid-1`.

## Criterios de aceptación
- [ ] **AC-9** — Un `DomainError` con `code = 'CONFLICT'` y mensaje `'Group exists'` → `409 { code: 'CONFLICT', message: 'Group exists', correlationId: 'cid-1' }`.
- [ ] **AC-10a** — `throw new Error('db password=x')` → `500 { code: 'INTERNAL_ERROR', message: 'Internal server error', correlationId: 'cid-1' }`; el body no contiene `password` ni `stack`.
- [ ] **AC-10b** — Ese caso produce una línea `level: 'error'` con `correlationId: 'cid-1'` y un `err` que incluye el mensaje original.
- [ ] **AC-10c** — `DomainError` con `code = 'NOT_REGISTERED_CODE'` → 500 `INTERNAL_ERROR` + línea `error` con `msg: 'Unmapped domain error code'`.
- [ ] **AC-11** — `GET /no-existe` → `404 { code: 'NOT_FOUND', message: 'Resource not found', correlationId: 'cid-1' }`; un `ConflictException` de Nest → 409 `CONFLICT`; un `MethodNotAllowed`/405 → `BAD_REQUEST` con status 405.

## Fuera de alcance
- `details` de validación (spec 003). Registro global en `AppModule` (T07).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/http
pnpm check
```

## Handoff
