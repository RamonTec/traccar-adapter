---
id: 009-T04
status: todo           # todo | doing | blocked | done
depends_on: [009-T03, 003-T02]
covers: [AC-2, AC-3, AC-4, AC-8]
---

# 009-T04 — Add JetStreamPublisher

## Objetivo
Publicar en JetStream con deduplicación (`msgID`), esperando el PubAck, con timeout, propagación del `correlationId` y un log por publicación.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/nats/nats-connection.manager.ts` (solo exports)
- `src/shared/infrastructure/context/request-context.ts` (solo `currentCorrelationId`)
- `src/shared/domain/upstream-unavailable.error.ts`
- `test/support/nats.ts`

## Contrato
```ts
// src/shared/infrastructure/nats/jetstream.publisher.ts
import { headers } from '@nats-io/transport-node';
export interface PublishOptions { readonly msgId: string; readonly correlationId?: string }
export interface PublishResult { readonly stream: string; readonly seq: number; readonly duplicate: boolean }
@Injectable()
export class JetStreamPublisher {
  private readonly logger = new Logger(JetStreamPublisher.name);
  constructor(conn: NatsConnectionManager, @Inject(APP_CONFIG) config: AppConfig);
  publish(subject: string, payload: unknown, opts: PublishOptions): Promise<PublishResult>;
}
// h = headers(); h.set('x-correlation-id', opts.correlationId ?? currentCorrelationId() ?? '')  (omitir si está vacío)
// ack = await conn.jetstream().publish(subject, new TextEncoder().encode(JSON.stringify(payload)), { msgID: opts.msgId, timeout: publishTimeoutMs, headers: h })
// ok → log (ack.duplicate ? debug : info) { subject, msgId, duplicate, durationMs }
// cualquier error (incluido !isReady) → logger.error({ subject, msgId, err }, 'JetStream publish failed'); throw new UpstreamUnavailableError('nats')
// MessagingModule: providers/exports += JetStreamPublisher
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/nats/jetstream.publisher.ts` (nuevo)
- [ ] `src/shared/infrastructure/nats/messaging.module.ts` (modificar)
- [ ] `test/jetstream-publisher.e2e-spec.ts` (nuevo, contra NATS real)

## Criterios de aceptación
- [ ] **AC-2** — Publicar en `telemetry.events.position` → el mensaje está en `TELEMETRY_EVENTS`, su body es el JSON del payload, y tiene los headers `Nats-Msg-Id` = `msgId` y `x-correlation-id`.
- [ ] **AC-3** — Publicar dos veces con el mismo `msgId` → la segunda devuelve `duplicate: true`, el stream tiene 1 mensaje y hay un log `debug`.
- [ ] **AC-4** — Sin conexión (manager no listo) → `UpstreamUnavailableError('nats')` y log `error`. Con un subject sin stream (`nada.que.ver`) y `timeout: 200` → el mismo error en menos de 1 s.
- [ ] **AC-8** — El log de éxito incluye `subject`, `msgId`, `duplicate` y `durationMs`, y no incluye el payload.

## Fuera de alcance
- Adaptar eventos de dominio (T05) y el dead-letter (010).

## Verificación
```bash
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
