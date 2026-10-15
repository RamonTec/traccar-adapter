---
id: 009-T03
status: done           # todo | doing | blocked | done
depends_on: [009-T01, 009-T02, 003-T05]
covers: [AC-1, AC-5, AC-6, AC-7]
---

# 009-T03 — Add NatsConnectionManager

## Objetivo
Conectar a NATS sin bloquear el arranque, asegurar los streams, reportar el estado en `/health/ready` y cerrar de forma ordenada.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/nats/stream-definitions.ts`
- `src/shared/infrastructure/health/readiness.registry.ts` (solo exports)
- `src/app.module.ts`
- `test/support/nats.ts`

## Contrato
```ts
// src/shared/infrastructure/nats/nats-connection.manager.ts
import { connect, credsAuthenticator } from '@nats-io/transport-node';
import { jetstream, jetstreamManager, type JetStreamClient } from '@nats-io/jetstream';
@Injectable()
export class NatsConnectionManager implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(APP_CONFIG) config: AppConfig, readiness: ReadinessRegistry);
  onApplicationBootstrap(): void;   // readiness.register('nats', async () => this.isReady()); void this.start()
  isReady(): boolean;
  jetstream(): JetStreamClient;     // !isReady → throw new UpstreamUnavailableError('nats')
  onApplicationShutdown(): Promise<void>; // await nc?.drain()
}
// start(): try { nc = await connect({ servers, name: 'traccar-adapter', maxReconnectAttempts: -1, reconnectTimeWait: 2000,
//          authenticator: credsFile ? credsAuthenticator(readFileSync(credsFile)) : undefined }) }
//   catch → log warn 'NATS not reachable, retrying' { attempt, delayMs }; timer = setTimeout(start, min(1000·2^attempt, 30000)); return
//   → ensureStreams() → ready = true; escuchar nc.status(): 'disconnect' → ready = false; 'reconnect' → ensureStreams(); ready = true
// onApplicationShutdown(): stopped = true; clearTimeout(timer); await nc?.drain()   (sin timers vivos aunque nunca conectara)
// ensureStreams(): por cada StreamDefinition: info → si no existe, add({ name, subjects, storage: 'file', retention: 'limits', max_age, duplicate_window })
//   si subjects, max_age o duplicate_window difieren → update; log info 'Stream ensured' { name, action: created|updated|unchanged }
// src/shared/infrastructure/nats/messaging.module.ts → @Global, providers/exports: [NatsConnectionManager]
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/nats/nats-connection.manager.ts` (nuevo)
- [ ] `src/shared/infrastructure/nats/messaging.module.ts` (nuevo) y `src/app.module.ts` (importarlo)
- [ ] `test/nats-connection.e2e-spec.ts` (nuevo, contra NATS real)

## Criterios de aceptación
- [ ] **AC-1a** — Con NATS limpio, al arrancar la app existen `TELEMETRY_EVENTS` y `TELEMETRY_DEADLETTER` con los subjects, el almacenamiento `file`, `max_age` y `duplicate_window` de las definiciones.
- [ ] **AC-1b** — Si el stream existe con otro `max_age`, tras arrancar queda actualizado (log `action: 'updated'`).
- [ ] **AC-5** — Con `NATS_SERVERS` apuntando a un puerto cerrado, la app arranca, `GET /health` da 200 y `/health/ready` da 503 con `"nats":"error"`.
- [ ] **AC-6** — Con NATS disponible, `/health/ready` incluye `"nats":"ok"`, después de esperar con `vi.waitFor` a que conecte.
- [ ] **AC-7b** — Con NATS inaccesible, `app.close()` termina en menos de 1 s y no quedan reintentos programados (verificar con `vi.useFakeTimers` o contando intentos tras cerrar).
- [ ] **AC-7** — `app.close()` hace `drain` (espía o comprobación de `nc.isClosed()` tras cerrar) y el proceso de Vitest no queda colgado.

## Fuera de alcance
- Publicar (T04).

## Verificación
```bash
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
- `NatsConnectionManager`: primer connect con bucle propio cancelable (1 s→30 s), luego reconexión del cliente; `ensureStreams` (created/updated/unchanged); readiness 'nats'; drain al cerrar.
- `MessagingModule` @Global importado en AppModule.
- Desviaciones: los tests de readiness de 003 (`app.e2e-spec.ts`) esperan a NATS e incluyen `nats` en `checks`; `vitest.config.e2e.ts` con `fileParallelism: false` (las suites comparten streams).
