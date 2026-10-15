---
id: 013-T06
status: todo           # todo | doing | blocked | done
depends_on: [013-T03, 013-T04, 013-T05]
covers: [AC-11, AC-12]
---

# 013-T06 — Add OutboxModule, readiness wiring and non-critical NATS

## Objetivo
La app real provee `ReliablePublisher`, drena al arrancar, informa del outbox en `/health/ready` y sigue lista con NATS caído.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/nats/messaging.module.ts` (patrón `@Global`)
- `src/shared/infrastructure/nats/nats-connection.manager.ts`
- `src/shared/infrastructure/health/readiness.registry.ts` (solo exports)
- `src/app.module.ts`

## Contrato
```ts
// src/shared/infrastructure/outbox/outbox.module.ts
@Global() @Module({
  providers: [
    { provide: SqliteOutboxStore, useFactory: (c: AppConfig) => new SqliteOutboxStore(c.outbox), inject: [APP_CONFIG] },
    OutboxDrainer, ReliablePublisher,
  ],
  exports: [ReliablePublisher],
})
export class OutboxModule implements OnModuleInit, OnApplicationShutdown {
  // onModuleInit: registry.register('outbox', () => Promise.resolve(store.isWritable()));  (crítico)
  //               registry.registerInfo('outbox', () => store.stats());
  // onApplicationShutdown: store.close()
}
// nats-connection.manager.ts: register('nats', …, { critical: false })
// app.module.ts: imports += OutboxModule
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/outbox/outbox.module.ts` (nuevo)
- [ ] `src/shared/infrastructure/nats/nats-connection.manager.ts` (modificar)
- [ ] `src/app.module.ts` (modificar)

## Criterios de aceptación
- [ ] **AC-12** — `test/nats-connection.e2e-spec.ts` AC-5 se actualiza: con NATS inaccesible `/health/ready` da **200** con `checks: { nats: 'down', outbox: 'ok', traccar: 'ok' }` y `outbox: { pending: 0, oldestAgeMs: null }`.
- [ ] Los tests de readiness de `test/app.e2e-spec.ts` esperan además `outbox: 'ok'` y el bloque `outbox`.
- [ ] `pnpm test:e2e` en verde.

## Fuera de alcance
- Usar `ReliablePublisher` en ingestion (T08).

## Verificación
```bash
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
