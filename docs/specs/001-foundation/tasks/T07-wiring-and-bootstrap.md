---
id: 001-T07
status: done           # todo | doing | blocked | done
depends_on: [001-T02, 001-T04, 001-T05, 001-T06]
covers: [AC-1, AC-2, AC-12, AC-13, AC-14]
---

# 001-T07 — Wire AppModule and bootstrap, remove starter boilerplate

## Objetivo
La app real arranca con config validada, logger pino, filtro global, `/health` y apagado ordenado; desaparece el "Hello World".

## Contexto (leer SOLO esto)
- `src/app.module.ts`
- `src/main.ts`
- `test/app.e2e-spec.ts`

## Contrato (piezas ya existentes, no abrirlas)
```ts
// shared/infrastructure/config/app-config.ts
export interface AppConfig { readonly port: number; readonly logLevel: LogLevel }
export const APP_CONFIG: symbol;
export class ConfigValidationError extends Error { readonly invalidVariables: readonly string[] }
export function loadConfig(env: Record<string, string | undefined>): AppConfig;
// shared/infrastructure/logging/logging.module.ts
export class LoggingModule { static forRoot(config: AppConfig, stream?: DestinationStream): DynamicModule }
// shared/infrastructure/logging/pino-http-options.ts
export const SERVICE_NAME = 'traccar-adapter';
// shared/infrastructure/http/http-exception.filter.ts → export class HttpExceptionFilter
// shared/infrastructure/http/health.controller.ts     → export class HealthController

// NUEVO — src/app.module.ts
@Module({})
export class AppModule {
  static register(config: AppConfig, logStream?: DestinationStream): DynamicModule;
  // imports: [LoggingModule.forRoot(config, logStream)], controllers: [HealthController],
  // providers: [{ provide: APP_CONFIG, useValue: config }, { provide: APP_FILTER, useClass: HttpExceptionFilter }]
}
```
`main.ts`: `loadConfig(process.env)`; si lanza `ConfigValidationError` → `process.stderr.write(JSON.stringify({ time: new Date().toISOString(), level: 'error', service: SERVICE_NAME, context: 'Bootstrap', msg: 'Invalid environment variables', invalidVariables }) + '\n')` y `process.exit(1)`. Luego `NestFactory.create(AppModule.register(config), { bufferLogs: true })`, `app.useLogger(app.get(Logger))` (de `nestjs-pino`), `app.enableShutdownHooks()`, `await app.listen(config.port)`.

## Archivos a crear/modificar
- [x] `src/app.module.ts` (modificar)
- [x] `src/main.ts` (modificar)
- [x] `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts` (borrar)
- [x] `test/app.e2e-spec.ts` (reemplazar por un único test: `AppModule.register({ port: 0, logLevel: 'error' })` + supertest `GET /health` → 200). La suite completa llega en T08.

## Criterios de aceptación
- [x] **AC-1** — `pnpm build && node dist/main.js` arranca y `curl -i localhost:3000/health` → 200 con header `x-correlation-id`.
- [x] **AC-2** — `PORT=abc LOG_LEVEL=verbose node dist/main.js` termina con código 1 y una línea JSON en stderr que nombra `PORT` y `LOG_LEVEL` sin `abc` ni `verbose`.
- [x] **AC-12/14** — `pnpm test:e2e` pasa; `GET /` responde 404 `NOT_FOUND` (verificar con curl).
- [x] **AC-13** — Con la app corriendo, `kill -TERM <pid>` → el proceso termina con código 0.
- [x] No quedan referencias a `AppController`/`AppService` (`grep -r AppService src test` vacío).

## Fuera de alcance
- Automatizar AC-1/2/13 en tests (T08).

## Verificación
```bash
pnpm build && pnpm test:e2e
pnpm check
```

## Handoff
- `AppModule.register(config, logStream)` registrado como módulo dinámico conectando `LoggingModule`, `HealthController`, `APP_CONFIG` y `HttpExceptionFilter`.
- `main.ts` valida configuración al arrancar, loguea variables inválidas en stderr en JSON estructurado y sale con código 1. Con `useProcessExit: true`, `SIGTERM` finaliza con código 0.
- Starter boilerplate eliminado por completo.

