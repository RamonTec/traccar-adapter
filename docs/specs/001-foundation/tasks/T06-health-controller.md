---
id: 001-T06
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-12]
---

# 001-T06 — Add health controller

## Objetivo
`GET /health` (liveness) responde `200 {"status":"ok"}` sin consultar dependencias (ADR-0002 §2).

## Contexto (leer SOLO esto)
- `docs/standards/testing.md`

## Contrato
```ts
// src/shared/infrastructure/http/health.controller.ts
@Controller('health')
export class HealthController {
  @Get() check(): { status: 'ok' };
}
```

## Archivos a crear/modificar
- [x] `src/shared/infrastructure/http/health.controller.ts` (nuevo)
- [x] `src/shared/infrastructure/http/health.controller.spec.ts` (nuevo) — `Test.createTestingModule({ controllers: [HealthController] })` + supertest.

## Criterios de aceptación
- [x] **AC-12a** — `GET /health` → `200`, body exactamente `{ "status": "ok" }`, `content-type` JSON.
- [x] **AC-12b** — El controller no tiene dependencias inyectadas (constructor vacío) ni guards.

## Fuera de alcance
- `/health/ready` (cuando existan Traccar/NATS). Registro en `AppModule` (T07).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/http/health.controller.spec.ts
pnpm check
```

## Handoff
- `HealthController` implementado respondiendo `GET /health` con `{ status: 'ok' }`.
- Sin dependencias ni guards.
- Listo para montarse en `AppModule` durante T07.

