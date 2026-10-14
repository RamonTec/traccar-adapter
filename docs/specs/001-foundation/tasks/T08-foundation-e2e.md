---
id: 001-T08
status: done           # todo | doing | blocked | done
depends_on: [001-T07]
covers: [AC-1, AC-2, AC-5, AC-11, AC-12, AC-13, AC-14]
---

# 001-T08 — Add foundation e2e suite

## Objetivo
Automatizar los ACs de arranque, contrato HTTP y ciclo de vida contra la app real.

## Contexto (leer SOLO esto)
- `test/app.e2e-spec.ts`
- `test/support/log-capture.ts`
- `package.json` (solo `scripts`)
- `docs/standards/testing.md`

## Contrato
```ts
// src/app.module.ts
AppModule.register(config: { port: number; logLevel: 'debug'|'info'|'warn'|'error' }, logStream?: DestinationStream): DynamicModule
// test/support/log-capture.ts
createLogCapture(): { stream: DestinationStream; lines(): Record<string, unknown>[] }
// Bootstrap real: dist/main.js lee PORT y LOG_LEVEL de env; error de config → exit 1 + JSON en stderr con invalidVariables.
```
Helpers dentro del spec: `freePort()` (net server en puerto 0 → leer puerto → cerrar); `startApp(env)` = `spawn('node', ['dist/main.js'], { env: { ...process.env, ...env } })`; `waitForHealth(port, 5000)` (poll con `fetch`).

## Archivos a crear/modificar
- [x] `test/app.e2e-spec.ts` (ampliar)
- [x] `package.json`: `"test:e2e": "pnpm build && vitest run --config ./vitest.config.e2e.ts"`

## Criterios de aceptación
**In-process** (`AppModule.register` + supertest + `useLogger`):
- [x] **AC-12** — `GET /health` → 200 `{ status: 'ok' }`.
- [x] **AC-14/11** — `GET /` → 404 `{ code: 'NOT_FOUND', message: 'Resource not found', correlationId }`.
- [x] **AC-5** — Con `x-correlation-id: e2e-1`, la respuesta lo devuelve y el `correlationId` del body de error es `e2e-1`.

**Proceso real** (`dist/main.js`, puerto libre):
- [x] **AC-1** — Con `PORT=<libre>` el proceso responde 200 en `/health` en < 5 s.
- [x] **AC-2** — Con `PORT=abc LOG_LEVEL=verbose` sale con código 1 en < 5 s; stderr parsea como JSON con `invalidVariables` ⊇ `['PORT','LOG_LEVEL']` y no contiene `abc`.
- [x] **AC-13** — Tras `/health` OK, `child.kill('SIGTERM')` → `exit` con código 0 en < 5 s.
- [x] Los procesos hijos se matan en `afterEach` aunque el test falle.

## Fuera de alcance
- Tests de logging detallado (ya en T04) y del filtro (T05).

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
- Suite e2e completa implementada cubriendo tests in-process y proceso real (arranque, bootstrap error en stderr, /health, / 404, correlation ID y graceful shutdown con SIGTERM).
- Script `test:e2e` actualizado para compilar antes de ejecutar e2e.
- Spec 001-foundation completado en su totalidad.

