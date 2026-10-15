---
id: 013-T05
status: todo           # todo | doing | blocked | done
depends_on: [013-T02]
covers: [AC-5, AC-6, AC-8, AC-9, AC-11]
---

# 013-T05 — Add OutboxDrainer

## Objetivo
Publicar los pendientes en orden cuando JetStream esté disponible, con backoff, sin bloquear ni duplicar.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/outbox/sqlite-outbox.store.ts` (solo exports)
- `src/shared/infrastructure/nats/jetstream.publisher.ts` (solo exports)

## Contrato
```ts
// src/shared/infrastructure/outbox/outbox.drainer.ts
@Injectable() export class OutboxDrainer implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(store: SqliteOutboxStore, js: JetStreamPublisher);
  onApplicationBootstrap(): void;   // kick()  (AC-8)
  kick(): void;                      // si ya hay un drenado o un timer en curso, no hace nada
  onApplicationShutdown(): void;     // stopped = true; clearTimeout
}
// drain(): while (!stopped && (e = store.oldest())) {
//   try { await js.publish(e.subject, JSON.parse(e.body), { msgId: e.msgId, correlationId: e.correlationId }) }
//   catch → attempt++; timer = setTimeout(drain, min(1000·2^(attempt-1), 30000)); return
//   store.delete(e.seq); attempt = 0; log info 'Buffered message delivered' { id: e.msgId, subject: e.subject, pending }
// }
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/outbox/outbox.drainer.ts` (nuevo) + `.spec.ts` (unit: store real `:memory:`, `JetStreamPublisher` fake, `vi.useFakeTimers`)

## Criterios de aceptación
- [ ] **AC-5** — 3 pendientes → publicados en orden con su `msgId`/`correlationId`/payload y borrados.
- [ ] **AC-6** — El fake falla 2 veces → reintenta a 1 s y 2 s; a la 3ª publica; nada se pierde.
- [ ] Single-flight: dos `kick()` seguidos no publican dos veces el mismo pendiente.
- [ ] **AC-8** — `onApplicationBootstrap` con pendientes → drena.
- [ ] Tras `onApplicationShutdown` no quedan timers ni publicaciones.
- [ ] **AC-11** — Log `info` por mensaje drenado, sin body.

## Fuera de alcance
- AC-9 contra NATS real (T09).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/outbox
pnpm check
```

## Handoff
