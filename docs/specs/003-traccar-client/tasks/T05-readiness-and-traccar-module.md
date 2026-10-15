---
id: 003-T05
status: done           # todo | doing | blocked | done
depends_on: [003-T04, 002-T04]
covers: [AC-6, AC-7]
---

# 003-T05 — Add readiness registry, /health/ready and TraccarModule wiring

## Objetivo
Exponer `GET /health/ready` con el check de Traccar (extensible a NATS) y dejar el cliente de Traccar disponible por inyección para los módulos de negocio.

## Contexto (leer SOLO esto)
- `src/app.module.ts`
- `src/shared/infrastructure/traccar/traccar-http-client.ts` (solo exports)
- `src/shared/infrastructure/auth/auth.decorators.ts` (solo `Public`)
- `test/app.e2e-spec.ts`

## Contrato
```ts
// src/shared/infrastructure/health/readiness.registry.ts
export type ReadinessCheck = () => Promise<boolean>;
@Injectable() export class ReadinessRegistry {
  register(name: string, check: ReadinessCheck): void;               // nombre duplicado → Error
  run(): Promise<{ ok: boolean; checks: Record<string, 'ok' | 'error'> }>; // un check que lanza = 'error'
}
// src/shared/infrastructure/health/readiness.controller.ts
@Public() @Controller('health') export class ReadinessController {
  @Get('ready') ready(@Res({ passthrough: true }) res): Promise<{ status: 'ok' | 'error'; checks: Record<string, 'ok' | 'error'> }>; // 503 si !ok
}
// src/shared/infrastructure/health/health.module.ts → @Global, provee y exporta ReadinessRegistry, controllers: [ReadinessController]
// src/shared/infrastructure/traccar/traccar.module.ts
@Global() @Module({ providers: [{ provide: TraccarHttpClient, useFactory: (c: AppConfig) => new TraccarHttpClient(c.traccar), inject: [APP_CONFIG] }], exports: [TraccarHttpClient] })
export class TraccarModule implements OnModuleInit { /* registry.register('traccar', () => client.request('server.get','GET','/api/server').then(() => true)) */ }
```

## Archivos a crear/modificar
- [x] `src/shared/infrastructure/health/readiness.registry.ts` + `readiness.controller.ts` + `health.module.ts` (nuevos) + `readiness.registry.spec.ts`
- [x] `src/shared/infrastructure/traccar/traccar.module.ts` (nuevo)
- [x] `src/app.module.ts` (importar `HealthModule` y `TraccarModule`)
- [x] `test/app.e2e-spec.ts` (ampliar: Traccar falso en el puerto 0, con `TRACCAR_BASE_URL` apuntando a él)

## Criterios de aceptación
- [x] **AC-7a** — Unit: un registry con un check `true` y otro que lanza → `{ ok: false, checks: { a: 'ok', b: 'error' } }`; registrar un nombre duplicado lanza.
- [x] **AC-7b** — E2E: con un Traccar falso que responde 200 a `/api/server` → `GET /health/ready` = `200 {"status":"ok","checks":{"traccar":"ok"}}` sin token.
- [x] **AC-7c** — E2E: con el Traccar falso respondiendo 500 (o caído) → `503 {"status":"error","checks":{"traccar":"error"}}`.
- [x] **AC-6** — E2E: con `x-correlation-id: ready-1`, el Traccar falso recibe `x-correlation-id: ready-1`.
- [x] `GET /health` sigue respondiendo 200 sin consultar Traccar.

## Fuera de alcance
- Check de NATS (009).

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
Implementado ReadinessRegistry, ReadinessController (GET /health/ready) y TraccarModule que registra el check de Traccar (/api/server).
Soporta propagación de correlation ID upstream hacia Traccar.
GET /health permanece desacoplado de dependencias externas.
